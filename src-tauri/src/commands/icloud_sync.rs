use tauri::{AppHandle, State};

use crate::application::dto::ICloudSyncDebugInfoDto;
use crate::domain::models::ICloudSyncStatus;
use crate::error::AppError;
use crate::infrastructure::sync_engine::{decorate_status, emit_sync_status, SyncEngine};
use crate::state::AppState;

#[tauri::command]
pub fn get_icloud_sync_status(state: State<'_, AppState>) -> Result<ICloudSyncStatus, String> {
  let repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .get_icloud_sync_status()
    .map_err(|error| error.to_string())?;
  Ok(decorate_status(&state, status))
}

#[tauri::command]
pub fn set_icloud_sync_enabled(
  app_handle: AppHandle,
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
  drop(repository);
  if enabled {
    state.reset_sync_backoff();
    state.schedule_sync(true);
  }
  let status = decorate_status(&state, status);
  emit_sync_status(&app_handle, &status);
  Ok(status)
}

#[tauri::command]
pub fn get_icloud_sync_debug_info(
  state: State<'_, AppState>,
) -> Result<ICloudSyncDebugInfoDto, String> {
  let repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let (pending_operation_count, tombstone_count, server_change_token_present, device_id) =
    repository
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
pub fn run_icloud_sync(
  app_handle: AppHandle,
  state: State<'_, AppState>,
) -> Result<ICloudSyncStatus, String> {
  {
    let repository = state
      .repository
      .lock()
      .map_err(|_| AppError::StateLock.to_string())?;
    let current = repository
      .get_icloud_sync_status()
      .map_err(|error| error.to_string())?;
    if !current.enabled {
      let status = decorate_status(&state, current);
      emit_sync_status(&app_handle, &status);
      return Ok(status);
    }
  }

  state.reset_sync_backoff();
  state.schedule_sync(true);
  let status = SyncEngine::current_status(&state).map_err(|error| error.to_string())?;
  emit_sync_status(&app_handle, &status);
  Ok(status)
}

#[tauri::command]
pub fn reset_icloud_sync_checkpoint(
  app_handle: AppHandle,
  state: State<'_, AppState>,
) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .reset_icloud_sync_checkpoint()
    .map_err(|error| error.to_string())?;
  drop(repository);
  state.reset_sync_backoff();
  state.schedule_sync(true);
  let status = decorate_status(&state, status);
  emit_sync_status(&app_handle, &status);
  Ok(status)
}

#[tauri::command]
pub fn force_upload_all_documents(
  app_handle: AppHandle,
  state: State<'_, AppState>,
) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .force_upload_all_documents()
    .map_err(|error| error.to_string())?;
  drop(repository);
  state.reset_sync_backoff();
  state.schedule_sync(true);
  let status = decorate_status(&state, status);
  emit_sync_status(&app_handle, &status);
  Ok(status)
}

#[tauri::command]
pub fn force_redownload_from_cloud(
  app_handle: AppHandle,
  state: State<'_, AppState>,
) -> Result<ICloudSyncStatus, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let status = repository
    .force_redownload_from_cloud()
    .map_err(|error| error.to_string())?;
  drop(repository);
  state.reset_sync_backoff();
  state.schedule_sync(true);
  let status = decorate_status(&state, status);
  emit_sync_status(&app_handle, &status);
  Ok(status)
}
