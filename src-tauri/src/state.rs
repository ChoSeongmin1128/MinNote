use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::error::AppError;
use crate::infrastructure::sqlite::SqliteStore;
use crate::sync::SyncManager;

pub struct AppState {
  pub repository: Mutex<SqliteStore>,
  pub sync_manager: Mutex<SyncManager>,
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
}
