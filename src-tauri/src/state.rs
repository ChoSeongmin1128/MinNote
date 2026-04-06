use std::path::Path;
use std::sync::{Condvar, Mutex};
use std::time::Duration;
use std::{fs, io};

use crate::error::AppError;
use crate::infrastructure::sqlite::SqliteStore;

#[derive(Default)]
pub struct WindowControlState {
  pub active_global_toggle_shortcut: Option<String>,
  pub global_shortcut_error: Option<String>,
  pub menu_bar_icon_error: Option<String>,
  pub window_preference_error: Option<String>,
}

pub struct AppState {
  pub repository: Mutex<SqliteStore>,
  pub window_controls: Mutex<WindowControlState>,
  pub sync_runtime: Mutex<SyncRuntimeState>,
  pub sync_runtime_condvar: Condvar,
  pub shutdown_confirmed: Mutex<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncRuntimePhase {
  Idle,
  Scheduled,
  Checking,
  Syncing,
  BackoffWaiting,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncTriggerReason {
  Initial,
  TextMutation,
  StructuralMutation,
  Foreground,
  Online,
  Periodic,
  Manual,
  RemoteNotification,
}

impl SyncTriggerReason {
  pub fn from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "initial" => Ok(Self::Initial),
      "text_mutation" => Ok(Self::TextMutation),
      "structural_mutation" => Ok(Self::StructuralMutation),
      "foreground" => Ok(Self::Foreground),
      "online" => Ok(Self::Online),
      "periodic" => Ok(Self::Periodic),
      "manual" => Ok(Self::Manual),
      "remote_notification" => Ok(Self::RemoteNotification),
      _ => Err(AppError::validation(format!(
        "알 수 없는 동기화 트리거입니다: {value}"
      ))),
    }
  }
}

pub struct SyncRuntimeState {
  pub phase: SyncRuntimePhase,
  pub scheduled: bool,
  pub force_run: bool,
  pub backoff_attempt: usize,
  pub next_retry_at_ms: Option<u64>,
  pub queued_trigger: Option<SyncTriggerReason>,
  pub active_trigger: Option<SyncTriggerReason>,
}

impl Default for SyncRuntimeState {
  fn default() -> Self {
    Self {
      phase: SyncRuntimePhase::Idle,
      scheduled: false,
      force_run: false,
      backoff_attempt: 0,
      next_retry_at_ms: None,
      queued_trigger: None,
      active_trigger: None,
    }
  }
}

impl AppState {
  pub fn new(db_path: &Path) -> Result<Self, AppError> {
    let repository = SqliteStore::new(db_path)?;
    let sync_state_path = db_path
      .parent()
      .unwrap_or(db_path)
      .join("sync-engine-state.json");
    match fs::remove_file(&sync_state_path) {
      Ok(()) => {}
      Err(error) if error.kind() == io::ErrorKind::NotFound => {}
      Err(error) => {
        return Err(AppError::validation(format!(
          "기존 동기화 상태 파일을 정리하지 못했습니다: {error}"
        )))
      }
    }

    Ok(Self {
      repository: Mutex::new(repository),
      window_controls: Mutex::new(WindowControlState::default()),
      sync_runtime: Mutex::new(SyncRuntimeState::default()),
      sync_runtime_condvar: Condvar::new(),
      shutdown_confirmed: Mutex::new(false),
    })
  }

  pub fn active_global_toggle_shortcut(&self) -> Option<String> {
    self
      .window_controls
      .lock()
      .ok()
      .and_then(|state| state.active_global_toggle_shortcut.clone())
  }

  pub fn set_active_global_toggle_shortcut(&self, shortcut: Option<String>) {
    if let Ok(mut state) = self.window_controls.lock() {
      state.active_global_toggle_shortcut = shortcut;
    }
  }

  pub fn global_shortcut_error(&self) -> Option<String> {
    self
      .window_controls
      .lock()
      .ok()
      .and_then(|state| state.global_shortcut_error.clone())
  }

  pub fn set_global_shortcut_error(&self, error: Option<String>) {
    if let Ok(mut state) = self.window_controls.lock() {
      state.global_shortcut_error = error;
    }
  }

  pub fn menu_bar_icon_error(&self) -> Option<String> {
    self
      .window_controls
      .lock()
      .ok()
      .and_then(|state| state.menu_bar_icon_error.clone())
  }

  pub fn set_menu_bar_icon_error(&self, error: Option<String>) {
    if let Ok(mut state) = self.window_controls.lock() {
      state.menu_bar_icon_error = error;
    }
  }

  pub fn window_preference_error(&self) -> Option<String> {
    self
      .window_controls
      .lock()
      .ok()
      .and_then(|state| state.window_preference_error.clone())
  }

  pub fn set_window_preference_error(&self, error: Option<String>) {
    if let Ok(mut state) = self.window_controls.lock() {
      state.window_preference_error = error;
    }
  }

  pub fn try_begin_sync(&self) -> bool {
    match self.sync_runtime.lock() {
      Ok(mut state) => {
        if matches!(
          state.phase,
          SyncRuntimePhase::Checking | SyncRuntimePhase::Syncing
        ) {
          return false;
        }
        state.scheduled = false;
        state.force_run = false;
        state.next_retry_at_ms = None;
        state.active_trigger = Some(SyncTriggerReason::Manual);
        state.phase = SyncRuntimePhase::Checking;
        true
      }
      Err(error) => {
        log::warn!("동기화 런타임 상태를 잠그지 못했습니다: {error}");
        false
      }
    }
  }

  pub fn set_sync_phase(&self, phase: SyncRuntimePhase) {
    if let Ok(mut state) = self.sync_runtime.lock() {
      state.phase = phase;
    }
    self.sync_runtime_condvar.notify_all();
  }

  pub fn sync_phase(&self) -> SyncRuntimePhase {
    match self.sync_runtime.lock() {
      Ok(state) => state.phase,
      Err(error) => {
        log::warn!("동기화 런타임 상태를 읽지 못했습니다: {error}");
        SyncRuntimePhase::Idle
      }
    }
  }

  pub fn schedule_sync(&self, trigger: SyncTriggerReason, force: bool) {
    if let Ok(mut state) = self.sync_runtime.lock() {
      state.scheduled = true;
      state.queued_trigger = Some(trigger);
      if force {
        state.force_run = true;
        state.next_retry_at_ms = None;
      }
      if !matches!(
        state.phase,
        SyncRuntimePhase::Checking | SyncRuntimePhase::Syncing
      ) {
        state.phase = if state.next_retry_at_ms.is_some() && !state.force_run {
          SyncRuntimePhase::BackoffWaiting
        } else {
          SyncRuntimePhase::Scheduled
        };
      }
    }
    self.sync_runtime_condvar.notify_all();
  }

  pub fn reset_sync_backoff(&self) {
    if let Ok(mut state) = self.sync_runtime.lock() {
      state.backoff_attempt = 0;
      state.next_retry_at_ms = None;
      if state.scheduled
        && !matches!(
          state.phase,
          SyncRuntimePhase::Checking | SyncRuntimePhase::Syncing
        )
      {
        state.phase = SyncRuntimePhase::Scheduled;
      }
    }
    self.sync_runtime_condvar.notify_all();
  }

  pub fn wait_for_scheduled_sync(&self) {
    let mut state = match self.sync_runtime.lock() {
      Ok(state) => state,
      Err(error) => {
        log::warn!("동기화 런타임 상태를 잠그지 못했습니다: {error}");
        std::thread::sleep(Duration::from_secs(1));
        return;
      }
    };

    loop {
      let now_ms = current_time_ms();
      if state.scheduled {
        let ready = state.force_run
          || state
            .next_retry_at_ms
            .map_or(true, |retry_at| retry_at <= now_ms);
        if ready {
          state.scheduled = false;
          state.force_run = false;
          state.next_retry_at_ms = None;
          state.active_trigger = state.queued_trigger.take();
          state.phase = SyncRuntimePhase::Checking;
          return;
        }

        if let Some(retry_at_ms) = state.next_retry_at_ms {
          state.phase = SyncRuntimePhase::BackoffWaiting;
          let wait_ms = retry_at_ms.saturating_sub(now_ms).max(1);
          match self
            .sync_runtime_condvar
            .wait_timeout(state, Duration::from_millis(wait_ms))
          {
            Ok((next_state, _)) => {
              state = next_state;
            }
            Err(error) => {
              log::warn!("동기화 대기 상태를 복구하지 못했습니다: {error}");
              std::thread::sleep(Duration::from_secs(1));
              return;
            }
          }
          continue;
        }
      }

      if matches!(
        state.phase,
        SyncRuntimePhase::Checking | SyncRuntimePhase::Syncing
      ) {
        match self.sync_runtime_condvar.wait(state) {
          Ok(next_state) => {
            state = next_state;
          }
          Err(error) => {
            log::warn!("동기화 대기 상태를 복구하지 못했습니다: {error}");
            std::thread::sleep(Duration::from_secs(1));
            return;
          }
        }
        continue;
      }

      state.phase = SyncRuntimePhase::Idle;
      match self.sync_runtime_condvar.wait(state) {
        Ok(next_state) => {
          state = next_state;
        }
        Err(error) => {
          log::warn!("동기화 대기 상태를 복구하지 못했습니다: {error}");
          std::thread::sleep(Duration::from_secs(1));
          return;
        }
      }
    }
  }

  pub fn schedule_sync_retry(&self) -> Duration {
    let delay = if let Ok(mut state) = self.sync_runtime.lock() {
      let delay = backoff_delay_for_attempt(state.backoff_attempt);
      state.backoff_attempt = state.backoff_attempt.saturating_add(1);
      state.scheduled = true;
      state.force_run = false;
      state.next_retry_at_ms = Some(current_time_ms().saturating_add(delay.as_millis() as u64));
      state.phase = SyncRuntimePhase::BackoffWaiting;
      delay
    } else {
      Duration::from_secs(5)
    };
    self.sync_runtime_condvar.notify_all();
    delay
  }

  pub fn finish_sync_cycle(&self) {
    if let Ok(mut state) = self.sync_runtime.lock() {
      state.active_trigger = None;
      if state.scheduled {
        state.phase = if state.next_retry_at_ms.is_some() && !state.force_run {
          SyncRuntimePhase::BackoffWaiting
        } else {
          SyncRuntimePhase::Scheduled
        };
      } else {
        state.phase = SyncRuntimePhase::Idle;
      }
    }
    self.sync_runtime_condvar.notify_all();
  }

  pub fn reset_sync_worker_after_success(&self) {
    if let Ok(mut state) = self.sync_runtime.lock() {
      state.backoff_attempt = 0;
      state.next_retry_at_ms = None;
      state.active_trigger = None;
      if state.scheduled {
        state.phase = SyncRuntimePhase::Scheduled;
      } else {
        state.phase = SyncRuntimePhase::Idle;
      }
    }
    self.sync_runtime_condvar.notify_all();
  }

  pub fn shutdown_confirmed(&self) -> bool {
    match self.shutdown_confirmed.lock() {
      Ok(state) => *state,
      Err(error) => {
        log::warn!("종료 확인 상태를 읽지 못했습니다: {error}");
        false
      }
    }
  }

  pub fn set_shutdown_confirmed(&self, confirmed: bool) {
    if let Ok(mut state) = self.shutdown_confirmed.lock() {
      *state = confirmed;
    }
  }
}

fn current_time_ms() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

fn backoff_delay_for_attempt(attempt: usize) -> Duration {
  match attempt {
    0 => Duration::from_secs(5),
    1 => Duration::from_secs(15),
    2 => Duration::from_secs(30),
    3 => Duration::from_secs(60),
    _ => Duration::from_secs(5 * 60),
  }
}
