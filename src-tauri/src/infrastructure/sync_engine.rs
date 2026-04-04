use crate::domain::models::{ICloudAccountStatus, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{CloudKitBridge, FetchChangesRequest};
use crate::infrastructure::sqlite::sync::SyncRunPreparation;
use crate::state::{AppState, SyncRuntimePhase};

pub(crate) struct SyncEngine;

impl SyncEngine {
  pub(crate) fn run(state: &AppState) -> Result<ICloudSyncStatus, AppError> {
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
}
