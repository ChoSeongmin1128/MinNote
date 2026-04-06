use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::application::dto::WorkspaceDocumentsChangedEventDto;
use crate::domain::models::{ICloudAccountStatus, ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{CloudKitBridge, FetchChangesRequest};
use crate::infrastructure::sqlite::{ICLOUD_ZONE_NAME, ICLOUD_ZONE_SUBSCRIPTION_ID};
use crate::infrastructure::sqlite::sync::{is_retryable_sync_error, RemoteApplySummary, SyncRunPreparation};
use crate::state::{AppState, SyncRuntimePhase};

pub(crate) const ICLOUD_SYNC_STATUS_CHANGED_EVENT: &str = "icloud-sync-status-changed";
pub(crate) const WORKSPACE_DOCUMENTS_CHANGED_EVENT: &str = "workspace-documents-changed";

pub(crate) struct SyncRunOutcome {
  pub status: ICloudSyncStatus,
  pub documents_changed_event: Option<WorkspaceDocumentsChangedEventDto>,
}

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
        Ok(outcome) => {
          state.reset_sync_worker_after_success();
          let status = decorate_status(&state, outcome.status);
          emit_sync_status(&app_handle, &status);
          if let Some(event) = outcome.documents_changed_event {
            emit_workspace_documents_changed(&app_handle, &event);
          }
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
  ) -> Result<SyncRunOutcome, AppError> {
    let preparation = {
      let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
      repository.begin_icloud_sync_run()?
    };

    let SyncRunPreparation::Ready {
      server_change_token,
    } = preparation
    else {
      let SyncRunPreparation::Disabled(status) = preparation else {
        unreachable!();
      };
      return Ok(SyncRunOutcome {
        status,
        documents_changed_event: None,
      });
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
        return Ok(SyncRunOutcome {
          status: repository.handle_unavailable_account_status(account_status)?,
          documents_changed_event: None,
        });
      }
      repository.set_cloudkit_account_status(account_status.clone())?;
    }

    bridge.ensure_zone("MinNoteZone")?;
    ensure_cloudkit_subscription(state, &bridge);

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
      repository.apply_remote_changes_and_build_operations(&changes)?
    };

    let response = if built.built.has_operations() {
      Some(bridge.apply_operations(built.built.request())?)
    } else {
      None
    };

    let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
    let completion =
      repository.complete_icloud_sync_run(account_status, &changes, &built, response.as_ref())?;
    Ok(SyncRunOutcome {
      status: completion.status,
      documents_changed_event: workspace_documents_changed_event(&completion.remote_apply_summary),
    })
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

fn ensure_cloudkit_subscription(state: &AppState, bridge: &CloudKitBridge) {
  let needs_ensure = match state.repository.lock() {
    Ok(repository) => match repository.cloudkit_subscription_needs_ensure() {
      Ok(needs_ensure) => needs_ensure,
      Err(error) => {
        log::warn!("CloudKit subscription 확인 상태를 읽지 못했습니다: {error}");
        return;
      }
    },
    Err(error) => {
      log::warn!("CloudKit subscription 확인을 위해 저장소를 잠그지 못했습니다: {error}");
      return;
    }
  };

  if !needs_ensure {
    return;
  }

  let installed = match bridge.ensure_subscription(ICLOUD_ZONE_NAME, ICLOUD_ZONE_SUBSCRIPTION_ID) {
    Ok(()) => true,
    Err(error) => {
      log::warn!("CloudKit subscription 보장을 실패했습니다. polling fallback을 유지합니다: {error}");
      false
    }
  };

  if let Ok(repository) = state.repository.lock() {
    if let Err(error) = repository.mark_cloudkit_subscription_check(installed) {
      log::warn!("CloudKit subscription 상태를 기록하지 못했습니다: {error}");
    }
  } else {
    log::warn!("CloudKit subscription 상태 기록을 위해 저장소를 잠그지 못했습니다");
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

fn workspace_documents_changed_event(
  summary: &RemoteApplySummary,
) -> Option<WorkspaceDocumentsChangedEventDto> {
  if !summary.has_changes() || summary.affected_document_ids.is_empty() {
    return None;
  }

  Some(WorkspaceDocumentsChangedEventDto {
    affected_document_ids: summary.affected_document_ids.clone(),
    documents_changed: summary.documents_changed,
    trash_changed: summary.trash_changed,
    current_document_may_be_stale: true,
  })
}

pub(crate) fn emit_workspace_documents_changed(
  app_handle: &AppHandle,
  payload: &WorkspaceDocumentsChangedEventDto,
) {
  if let Err(error) = app_handle.emit(WORKSPACE_DOCUMENTS_CHANGED_EVENT, payload) {
    log::warn!("문서 목록 변경 이벤트를 내보내지 못했습니다: {error}");
  }
}
