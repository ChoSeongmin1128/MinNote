use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::error::AppError;
use crate::infrastructure::sqlite::SqliteStore;
use crate::sync::SyncManager;

#[derive(Default)]
pub struct WindowControlState {
  pub active_global_toggle_shortcut: Option<String>,
  pub global_shortcut_error: Option<String>,
}

pub struct AppState {
  pub repository: Mutex<SqliteStore>,
  pub sync_manager: Mutex<SyncManager>,
  pub window_controls: Mutex<WindowControlState>,
  pub db_path: PathBuf,
  pub sync_state_path: PathBuf,
}

impl AppState {
  pub fn new(db_path: &Path) -> Result<Self, AppError> {
    let repository = SqliteStore::new(db_path)?;
    let sync_state_path = db_path
      .parent()
      .unwrap_or(db_path)
      .join("sync-engine-state.json");

    Ok(Self {
      repository: Mutex::new(repository),
      sync_manager: Mutex::new(SyncManager::new()),
      window_controls: Mutex::new(WindowControlState::default()),
      db_path: db_path.to_path_buf(),
      sync_state_path,
    })
  }

  pub fn notify_sync_changed(&self, document_id: &str) {
    if let Ok(mut sync) = self.sync_manager.lock() {
      sync.notify_changed(document_id);
    }
  }

  pub fn notify_sync_deleted(&self, document_id: &str) {
    if let Ok(mut sync) = self.sync_manager.lock() {
      sync.notify_deleted(document_id);
    }
  }

  pub fn notify_sync_reset(&self) {
    if let Ok(mut sync) = self.sync_manager.lock() {
      sync.notify_reset();
    }
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
}
