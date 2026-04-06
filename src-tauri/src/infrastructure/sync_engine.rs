use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::domain::models::{ICloudAccountStatus, ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{CloudKitBridge, FetchChangesRequest};
use crate::infrastructure::sqlite::sync::{is_retryable_sync_error, SyncRunPreparation};
use crate::state::{AppState, SyncRuntimePhase};

pub(crate) const ICLOUD_SYNC_STATUS_CHANGED_EVENT: &str = "icloud-sync-status-changed";

pub(crate) struct SyncEngine;

impl SyncEngine {
  pub(crate) fn start_worker(app_handle: AppHandle) {
    thread::spawn(move || loop {
      let Some(state) = app_handle.try_state::<AppState>() else {
        break;
      };
      state.wait_for_scheduled_sync();
      Self::emit_current_status(&app_handle, &state);

      let result = Self::run_once(&state, Some(&app_handle));
      match result {
        Ok(status) => {
          state.reset_sync_worker_after_success();
          let status = decorate_status(&state, status);
          emit_sync_status(&app_handle, &status);
        }
        Err(error) => {
          let retryable = is_retryable_sync_error(&error);
          let status = {
            let mut repository = match state.repository.lock() {
              Ok(repository) => repository,
              Err(lock_error) => {
                log::warn!("동기화 실패 상태를 기록하지 못했습니다: {lock_error}");
                state.finish_sync_cycle();
                continue;
              }
            };

            match repository.finish_failed_icloud_sync(&error) {
              Ok(status) => status,
              Err(inner_error) => {
                log::warn!("동기화 실패 상태를 갱신하지 못했습니다: {inner_error}");
                state.finish_sync_cycle();
                continue;
              }
            }
          };

          if retryable {
            let delay = state.schedule_sync_retry();
            log::info!(
              "iCloud 동기화를 {:?} 뒤에 다시 시도합니다: {}",
              delay,
              error
            );
          } else {
            state.finish_sync_cycle();
          }

          let status = decorate_status(&state, status);
          emit_sync_status(&app_handle, &status);
        }
      }
    });
  }

  pub(crate) fn run_once(
    state: &AppState,
    app_handle: Option<&AppHandle>,
  ) -> Result<ICloudSyncStatus, AppError> {
    let preparation = {
      let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
      repository.begin_icloud_sync_run()?
    };

    let SyncRunPreparation::Ready {
      server_change_token,
      has_server_change_token,
    } = preparation
    else {
      let SyncRunPreparation::Disabled(status) = preparation else {
        unreachable!();
      };
      return Ok(status);
    };

    let bridge = CloudKitBridge::new()?;

    state.set_sync_phase(SyncRuntimePhase::Checking);
    if let Some(app_handle) = app_handle {
      Self::emit_current_status(app_handle, state);
    }

    let account_status = bridge.get_account_status()?;

    {
      let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
      if account_status != ICloudAccountStatus::Available {
        return repository.handle_unavailable_account_status(account_status);
      }
      repository.set_cloudkit_account_status(account_status.clone())?;
    }

    bridge.ensure_zone("MinNoteZone")?;

    let changes = bridge.fetch_changes(&FetchChangesRequest {
      zone_name: "MinNoteZone".to_string(),
      server_change_token,
    })?;

    state.set_sync_phase(SyncRuntimePhase::Syncing);
    if let Some(app_handle) = app_handle {
      Self::emit_current_status(app_handle, state);
    }

    let built = {
      let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
      repository.apply_remote_changes_and_build_operations(has_server_change_token, &changes)?
    };

    let response = if built.has_operations() {
      Some(bridge.apply_operations(built.request())?)
    } else {
      None
    };

    let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
    repository.complete_icloud_sync_run(account_status, &changes, &built, response.as_ref())
  }

  pub(crate) fn current_status(state: &AppState) -> Result<ICloudSyncStatus, AppError> {
    let repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
    Ok(decorate_status(state, repository.get_icloud_sync_status()?))
  }

  pub(crate) fn emit_current_status(app_handle: &AppHandle, state: &AppState) {
    if let Ok(status) = Self::current_status(state) {
      emit_sync_status(app_handle, &status);
    }
  }
}

pub(crate) fn decorate_status(state: &AppState, mut status: ICloudSyncStatus) -> ICloudSyncStatus {
  status.state = match state.sync_phase() {
    SyncRuntimePhase::Checking => ICloudSyncState::Checking,
    SyncRuntimePhase::Syncing => ICloudSyncState::Syncing,
    _ => status.state,
  };
  status
}

pub(crate) fn emit_sync_status(app_handle: &AppHandle, status: &ICloudSyncStatus) {
  if let Err(error) = app_handle.emit(ICLOUD_SYNC_STATUS_CHANGED_EVENT, status) {
    log::warn!("iCloud 동기화 상태 이벤트를 내보내지 못했습니다: {error}");
  }
}
