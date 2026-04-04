use tauri::State;

use crate::application::dto::ICloudSyncDebugInfoDto;
use crate::domain::models::{ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::CloudKitBridge;
use crate::infrastructure::sqlite::sync::SyncRunPreparation;
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
  let (outbox_count, tombstone_count, server_change_token_present, device_id) = repository
    .get_icloud_sync_debug_info()
    .map_err(|error| error.to_string())?;
  let bridge = CloudKitBridge::new();
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
    outbox_count,
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
    let preparation = {
      let mut repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateLock.to_string())?;
      repository.begin_icloud_sync_run().map_err(|error| error.to_string())?
    };

    let SyncRunPreparation::Ready {
      server_change_token,
      has_server_change_token,
    } = preparation
    else {
      let SyncRunPreparation::Disabled(status) = preparation else {
        unreachable!();
      };
      return Ok(decorate_status(&state, status));
    };

    let bridge = match CloudKitBridge::new() {
      Ok(bridge) => bridge,
      Err(error) => return persist_sync_error_status(&state, error),
    };

    state.set_sync_phase(SyncRuntimePhase::Checking);
    let account_status = match bridge.get_account_status() {
      Ok(account_status) => account_status,
      Err(error) => return persist_sync_error_status(&state, error),
    };

    {
      let mut repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateLock.to_string())?;
      if account_status != crate::domain::models::ICloudAccountStatus::Available {
        let status = repository
          .handle_unavailable_account_status(account_status)
          .map_err(|error| error.to_string())?;
        return Ok(decorate_status(&state, status));
      }
      repository
        .set_cloudkit_account_status(account_status.clone())
        .map_err(|error| error.to_string())?;
    }

    if let Err(error) = bridge.ensure_zone("MinNoteZone") {
      return persist_sync_error_status(&state, error);
    }

    let changes = match bridge.fetch_changes(&crate::infrastructure::cloudkit_bridge::FetchChangesRequest {
      zone_name: "MinNoteZone".to_string(),
      server_change_token,
    }) {
      Ok(changes) => changes,
      Err(error) => return persist_sync_error_status(&state, error),
    };

    state.set_sync_phase(SyncRuntimePhase::Syncing);
    let built = {
      let mut repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateLock.to_string())?;
      repository
        .apply_remote_changes_and_build_operations(has_server_change_token, &changes)
        .map_err(|error| error.to_string())?
    };

    let response = if built.has_operations() {
      match bridge.apply_operations(built.request()) {
        Ok(response) => Some(response),
        Err(error) => return persist_sync_error_status(&state, error),
      }
    } else {
      None
    };

    let completion = {
      let mut repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateLock.to_string())?;
      repository.complete_icloud_sync_run(account_status, &changes, &built, response.as_ref())
    };
    match completion {
      Ok(status) => Ok(decorate_status(&state, status)),
      Err(error) => persist_sync_error_status(&state, error),
    }
  })();

  state.set_sync_phase(SyncRuntimePhase::Idle);
  result
}
