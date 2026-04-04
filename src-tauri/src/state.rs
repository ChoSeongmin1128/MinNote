use std::path::Path;
use std::sync::Mutex;
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
  pub shutdown_confirmed: Mutex<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncRuntimePhase {
  Idle,
  Checking,
  Syncing,
}

pub struct SyncRuntimeState {
  pub phase: SyncRuntimePhase,
}

impl Default for SyncRuntimeState {
  fn default() -> Self {
    Self {
      phase: SyncRuntimePhase::Idle,
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
      Err(error) => return Err(AppError::validation(format!("기존 동기화 상태 파일을 정리하지 못했습니다: {error}"))),
    }

    Ok(Self {
      repository: Mutex::new(repository),
      window_controls: Mutex::new(WindowControlState::default()),
      sync_runtime: Mutex::new(SyncRuntimeState::default()),
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
        if state.phase != SyncRuntimePhase::Idle {
          return false;
        }
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
