use serde::Serialize;
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
}

impl SyncManager {
  pub fn new() -> Self {
    Self { child: None }
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
    use tauri_plugin_shell::ShellExt;

    if self.is_running() {
      return Ok(());
    }

    let (mut rx, child) = app_handle
      .shell()
      .sidecar("minnote-sync")
      .map_err(|e| e.to_string())?
      .spawn()
      .map_err(|e| e.to_string())?;

    // stdout을 비동기로 수신하여 Tauri 이벤트로 emit
    let handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
      use tauri_plugin_shell::process::CommandEvent;
      while let Some(event) = rx.recv().await {
        match event {
          CommandEvent::Stdout(bytes) => {
            if let Ok(line) = String::from_utf8(bytes) {
              let trimmed = line.trim();
              if !trimmed.is_empty() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                  let _ = handle.emit("icloud-sync-event", &value);
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
    self.send(&OutgoingMessage::Start {
      db_path,
      state_path,
      container_identifier: "iCloud.com.seongmin.minnote",
    })
  }

  pub fn stop(&mut self) {
    let _ = self.send(&OutgoingMessage::Stop);
    self.child = None;
  }

  pub fn notify_changed(&mut self, document_id: &str) {
    let _ = self.send(&OutgoingMessage::NotifyChanged { document_id });
  }

  pub fn notify_deleted(&mut self, document_id: &str) {
    let _ = self.send(&OutgoingMessage::NotifyDeleted { document_id });
  }

  pub fn notify_reset(&mut self) {
    let _ = self.send(&OutgoingMessage::NotifyReset);
  }

  pub fn refresh(
    &mut self,
    app_handle: &tauri::AppHandle,
    db_path: &str,
    state_path: &str,
  ) -> Result<(), String> {
    if self.is_running() {
      return self.send(&OutgoingMessage::Refresh);
    }

    self.start(app_handle, db_path, state_path)
  }

  fn send<T: Serialize>(&mut self, message: &T) -> Result<(), String> {
    let Some(child) = &mut self.child else {
      return Ok(());
    };
    let mut json = serde_json::to_string(message).map_err(|e| e.to_string())?;
    json.push('\n');
    child.write(json.as_bytes()).map_err(|e| e.to_string())
  }
}
