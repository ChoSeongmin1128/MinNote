use serde::Serialize;
use serde_json::json;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandChild;

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum OutgoingMessage<'a> {
  Start {
    #[serde(rename = "dbPath")]
    db_path: &'a str,
    #[serde(rename = "statePath")]
    state_path: &'a str,
    #[serde(rename = "containerIdentifier")]
    container_identifier: &'a str,
  },
  Refresh,
  NotifyChanged {
    #[serde(rename = "documentId")]
    document_id: &'a str,
  },
  NotifyDeleted {
    #[serde(rename = "documentId")]
    document_id: &'a str,
  },
  NotifyReset,
  Stop,
}

pub struct SyncManager {
  child: Option<CommandChild>,
  app_handle: Option<tauri::AppHandle>,
  db_path: Option<String>,
  state_path: Option<String>,
}

impl SyncManager {
  pub fn new() -> Self {
    Self {
      child: None,
      app_handle: None,
      db_path: None,
      state_path: None,
    }
  }

  pub fn is_running(&self) -> bool {
    self.child.is_some()
  }

  pub fn start(
    &mut self,
    app_handle: &tauri::AppHandle,
    db_path: &str,
    state_path: &str,
  ) -> Result<(), String> {
    if self.is_running() {
      return Ok(());
    }

    self.remember_runtime(app_handle, db_path, state_path);
    self.spawn_sidecar()?;
    self.send_start_message()
  }

  pub fn stop(&mut self) {
    let _ = self.send(&OutgoingMessage::Stop);
    self.child = None;
  }

  pub fn notify_changed(&mut self, document_id: &str) {
    if let Err(error) = self.send_or_restart(OutgoingMessage::NotifyChanged { document_id }) {
      self.emit_sync_error(format!("동기화 변경 알림 실패: {error}"));
    }
  }

  pub fn notify_deleted(&mut self, document_id: &str) {
    if let Err(error) = self.send_or_restart(OutgoingMessage::NotifyDeleted { document_id }) {
      self.emit_sync_error(format!("동기화 삭제 알림 실패: {error}"));
    }
  }

  pub fn notify_reset(&mut self) {
    if let Err(error) = self.send_or_restart(OutgoingMessage::NotifyReset) {
      self.emit_sync_error(format!("동기화 초기화 알림 실패: {error}"));
    }
  }

  pub fn refresh(
    &mut self,
    app_handle: &tauri::AppHandle,
    db_path: &str,
    state_path: &str,
  ) -> Result<(), String> {
    self.remember_runtime(app_handle, db_path, state_path);

    if self.is_running() {
      return self.send_or_restart(OutgoingMessage::Refresh);
    }

    self.start(app_handle, db_path, state_path)
  }

  fn remember_runtime(
    &mut self,
    app_handle: &tauri::AppHandle,
    db_path: &str,
    state_path: &str,
  ) {
    self.app_handle = Some(app_handle.clone());
    self.db_path = Some(db_path.to_string());
    self.state_path = Some(state_path.to_string());
  }

  fn spawn_sidecar(&mut self) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let Some(app_handle) = self.app_handle.clone() else {
      return Err("sync app handle missing".to_string());
    };

    let (mut rx, child) = app_handle
      .shell()
      .sidecar("minnote-sync")
      .map_err(|e| e.to_string())?
      .spawn()
      .map_err(|e| e.to_string())?;

    let handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
      use tauri_plugin_shell::process::CommandEvent;

      let mut stdout_buffer = String::new();

      while let Some(event) = rx.recv().await {
        match event {
          CommandEvent::Stdout(bytes) => {
            stdout_buffer.push_str(String::from_utf8_lossy(&bytes).as_ref());

            while let Some(newline_index) = stdout_buffer.find('\n') {
              let line = stdout_buffer[..newline_index].trim().to_string();
              stdout_buffer.drain(..=newline_index);

              if line.is_empty() {
                continue;
              }

              match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(value) => {
                  let _ = handle.emit("icloud-sync-event", &value);
                }
                Err(error) => {
                  log::warn!("failed to parse sync sidecar json line: {error}");
                }
              }
            }
          }
          CommandEvent::Stderr(bytes) => {
            if let Ok(msg) = String::from_utf8(bytes) {
              log::warn!("sync sidecar: {}", msg.trim());
            }
          }
          CommandEvent::Terminated(_) => {
            log::info!("sync sidecar terminated");
            break;
          }
          _ => {}
        }
      }
    });

    self.child = Some(child);
    Ok(())
  }

  fn send_start_message(&mut self) -> Result<(), String> {
    let Some(db_path) = self.db_path.clone() else {
      return Err("sync db path missing".to_string());
    };
    let Some(state_path) = self.state_path.clone() else {
      return Err("sync state path missing".to_string());
    };

    self.send(&OutgoingMessage::Start {
      db_path: &db_path,
      state_path: &state_path,
      container_identifier: "iCloud.com.seongmin.minnote",
    })
  }

  fn send_or_restart(&mut self, message: OutgoingMessage<'_>) -> Result<(), String> {
    match self.send(&message) {
      Ok(()) => Ok(()),
      Err(error) if is_broken_pipe_error(&error) => {
        self.child = None;
        self.restart_sidecar()?;
        self.send(&message)
      }
      Err(error) => Err(error),
    }
  }

  fn restart_sidecar(&mut self) -> Result<(), String> {
    self.spawn_sidecar()?;
    self.send_start_message()
  }

  fn send<T: Serialize>(&mut self, message: &T) -> Result<(), String> {
    let Some(child) = &mut self.child else {
      return Err("sync sidecar unavailable".to_string());
    };

    let mut json = serde_json::to_string(message).map_err(|e| e.to_string())?;
    json.push('\n');
    match child.write(json.as_bytes()) {
      Ok(()) => Ok(()),
      Err(error) => {
        let error_message = error.to_string();
        if is_broken_pipe_error(&error_message) {
          self.child = None;
        }
        Err(error_message)
      }
    }
  }

  fn emit_sync_error(&self, message: String) {
    let Some(app_handle) = &self.app_handle else {
      return;
    };

    let _ = app_handle.emit("icloud-sync-event", json!({
      "type": "error",
      "message": message,
    }));
  }
}

fn is_broken_pipe_error(message: &str) -> bool {
  message.contains("Broken pipe") || message.contains("os error 32")
}
