use tauri::State;

use crate::application::dto::ICloudSyncDebugInfoDto;
use crate::domain::models::{ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::sync_engine::SyncEngine;
use crate::state::{AppState, SyncRuntimePhase};

fn decorate_status(state: &AppState, mut status: ICloudSyncStatus) -> ICloudSyncStatus {
  status.state = match state.sync_phase() {
    SyncRuntimePhase::Idle => status.state,
    SyncRuntimePhase::Checking => ICloudSyncState::Checking,
    SyncRuntimePhase::Syncing => ICloudSyncState::Syncing,
  };
  status
}

fn persist_sync_error_status(state: &State<'_, AppState>, error: AppError) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .finish_failed_icloud_sync(&error)
    .map_err(|inner| inner.to_string())?;
  Ok(decorate_status(state, status))
}

#[tauri::command]
pub fn get_icloud_sync_status(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  let repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository.get_icloud_sync_status().map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}

#[tauri::command]
pub fn set_icloud_sync_enabled(
  state: State<'_, AppState>,
  enabled: bool,
) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .set_icloud_sync_enabled(enabled)
    .map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}

#[tauri::command]
pub fn get_icloud_sync_debug_info(state: State<'_, AppState>) -> Result<ICloudSyncDebugInfoDto, String> {
  let repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let (pending_operation_count, tombstone_count, server_change_token_present, device_id) = repository
    .get_icloud_sync_debug_info()
    .map_err(|error| error.to_string())?;
  let bridge = crate::infrastructure::cloudkit_bridge::CloudKitBridge::new();
  let (bridge_available, bridge_error) = match bridge {
    Ok(_) => (true, None),
    Err(error) => (false, Some(error.to_string())),
  };
  let suffix = if device_id.len() > 8 {
    device_id[device_id.len() - 8..].to_string()
  } else {
    device_id
  };

  Ok(ICloudSyncDebugInfoDto {
    bridge_available,
    bridge_error,
    zone_name: "MinNoteZone".to_string(),
    server_change_token_present,
    pending_operation_count,
    tombstone_count,
    device_id_suffix: suffix,
  })
}

#[tauri::command]
pub fn run_icloud_sync(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  if !state.try_begin_sync() {
    return get_icloud_sync_status(state);
  }

  let result = (|| -> Result<ICloudSyncStatus, String> {
    match SyncEngine::run(&state) {
      Ok(status) => Ok(decorate_status(&state, status)),
      Err(error) => persist_sync_error_status(&state, error),
    }
  })();

  state.set_sync_phase(SyncRuntimePhase::Idle);
  result
}

#[tauri::command]
pub fn reset_icloud_sync_checkpoint(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .reset_icloud_sync_checkpoint()
    .map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}

#[tauri::command]
pub fn force_upload_all_documents(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .force_upload_all_documents()
    .map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}

#[tauri::command]
pub fn force_redownload_from_cloud(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .force_redownload_from_cloud()
    .map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}
