use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::application::dto::WorkspaceDocumentsChangedEventDto;
use crate::domain::models::{ICloudAccountStatus, ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{
    CloudKitBridge, FetchChangesRequest, FetchChangesResponse,
};
use crate::infrastructure::legacy_identity_migration::LEGACY_ICLOUD_ZONE_NAME;
use crate::infrastructure::sqlite::sync::{
    is_retryable_sync_error, RemoteApplySummary, SyncRunPreparation,
};
use crate::infrastructure::sqlite::{ICLOUD_ZONE_NAME, ICLOUD_ZONE_SUBSCRIPTION_ID};
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

        let bridge = CloudKitBridge::primary()?;

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

        bridge.ensure_zone(ICLOUD_ZONE_NAME)?;
        ensure_cloudkit_subscription(state, &bridge);

        let changes = bridge.fetch_changes(&FetchChangesRequest {
            zone_name: ICLOUD_ZONE_NAME.to_string(),
            server_change_token,
        })?;
        let legacy_changes = fetch_legacy_changes(state);
        let combined_changes = combine_changes(changes, legacy_changes.as_ref());

        state.set_sync_phase(SyncRuntimePhase::Syncing);
        if let Some(app_handle) = app_handle {
            Self::emit_current_status(app_handle, state);
        }

        let built = {
            let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
            repository.apply_remote_changes_and_build_operations(&combined_changes)?
        };

        let response = if built.built.has_operations() {
            let response = bridge.apply_operations(built.built.request())?;
            Some(response)
        } else {
            None
        };

        let mut repository = state.repository.lock().map_err(|_| AppError::StateLock)?;
        let completion = repository.complete_icloud_sync_run(
            account_status,
            &combined_changes,
            &built,
            response.as_ref(),
        )?;
        if let Some(token) = legacy_changes
            .as_ref()
            .and_then(|changes| changes.next_server_change_token.as_deref())
        {
            if let Err(error) = repository.set_legacy_server_change_token(Some(token)) {
                log::warn!("legacy iCloud 변경 토큰을 저장하지 못했습니다: {error}");
            }
        }
        Ok(SyncRunOutcome {
            status: completion.status,
            documents_changed_event: workspace_documents_changed_event(
                &completion.remote_apply_summary,
            ),
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

fn fetch_legacy_changes(state: &AppState) -> Option<FetchChangesResponse> {
    let legacy_token = match state.repository.lock() {
        Ok(repository) => match repository.legacy_server_change_token() {
            Ok(token) => token,
            Err(_) => return None,
        },
        Err(error) => {
            log::warn!("legacy iCloud 상태를 읽기 위해 저장소를 잠그지 못했습니다: {error}");
            return None;
        }
    };

    let legacy_bridge = match CloudKitBridge::legacy() {
        Ok(bridge) => bridge,
        Err(error) => {
            log::warn!("legacy iCloud bridge를 준비하지 못했습니다: {error}");
            return None;
        }
    };

    // Phase 2 keeps legacy iCloud as a read-only import source only.
    // Do not create old zones, mirror records, or write migration markers here.
    match legacy_bridge.fetch_changes(&FetchChangesRequest {
        zone_name: LEGACY_ICLOUD_ZONE_NAME.to_string(),
        server_change_token: legacy_token,
    }) {
        Ok(changes) => Some(changes),
        Err(error) => {
            log::warn!("legacy iCloud 변경을 가져오지 못했습니다: {error}");
            None
        }
    }
}

fn combine_changes(
    mut primary: FetchChangesResponse,
    legacy: Option<&FetchChangesResponse>,
) -> FetchChangesResponse {
    let Some(legacy) = legacy else {
        return primary;
    };

    primary.documents.extend(legacy.documents.clone());
    primary.blocks.extend(legacy.blocks.clone());
    primary
        .document_tombstones
        .extend(legacy.document_tombstones.clone());
    primary
        .block_tombstones
        .extend(legacy.block_tombstones.clone());
    primary
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

    let installed = match bridge.ensure_subscription(ICLOUD_ZONE_NAME, ICLOUD_ZONE_SUBSCRIPTION_ID)
    {
        Ok(()) => true,
        Err(error) => {
            log::warn!(
                "CloudKit subscription 보장을 실패했습니다. polling fallback을 유지합니다: {error}"
            );
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cloudkit_bridge::{
        BridgeBlockRecord, BridgeBlockTombstoneRecord, BridgeDocumentRecord,
        BridgeDocumentTombstoneRecord,
    };

    fn empty_changes(token: Option<&str>) -> FetchChangesResponse {
        FetchChangesResponse {
            documents: Vec::new(),
            blocks: Vec::new(),
            document_tombstones: Vec::new(),
            block_tombstones: Vec::new(),
            next_server_change_token: token.map(str::to_string),
        }
    }

    fn document(id: &str) -> BridgeDocumentRecord {
        BridgeDocumentRecord {
            document_id: id.to_string(),
            title: format!("document {id}"),
            block_tint_override: None,
            document_surface_tone_override: None,
            updated_at_ms: 10,
            updated_by_device_id: "device".to_string(),
        }
    }

    fn block(id: &str, document_id: &str) -> BridgeBlockRecord {
        BridgeBlockRecord {
            block_id: id.to_string(),
            document_id: document_id.to_string(),
            kind: "text".to_string(),
            content: format!("block {id}"),
            language: None,
            position: 1000,
            updated_at_ms: 20,
            updated_by_device_id: "device".to_string(),
        }
    }

    #[test]
    fn combine_changes_imports_legacy_records_but_keeps_primary_token() {
        let mut primary = empty_changes(Some("madi-token"));
        primary.documents.push(document("madi-document"));
        primary.blocks.push(block("madi-block", "madi-document"));
        primary
            .document_tombstones
            .push(BridgeDocumentTombstoneRecord {
                document_id: "madi-deleted-document".to_string(),
                deleted_at_ms: 30,
                deleted_by_device_id: "device".to_string(),
            });

        let mut legacy = empty_changes(Some("legacy-token"));
        legacy.documents.push(document("legacy-document"));
        legacy.blocks.push(block("legacy-block", "legacy-document"));
        legacy.block_tombstones.push(BridgeBlockTombstoneRecord {
            block_id: "legacy-deleted-block".to_string(),
            document_id: "legacy-document".to_string(),
            deleted_at_ms: 40,
            deleted_by_device_id: "device".to_string(),
        });

        let combined = combine_changes(primary, Some(&legacy));

        assert_eq!(
            combined.next_server_change_token.as_deref(),
            Some("madi-token")
        );
        assert_eq!(combined.documents.len(), 2);
        assert_eq!(combined.blocks.len(), 2);
        assert_eq!(combined.document_tombstones.len(), 1);
        assert_eq!(combined.block_tombstones.len(), 1);
        assert!(combined
            .documents
            .iter()
            .any(|record| record.document_id == "legacy-document"));
    }

    #[test]
    fn combine_changes_without_legacy_returns_primary_only() {
        let mut primary = empty_changes(Some("madi-token"));
        primary.documents.push(document("madi-document"));

        let combined = combine_changes(primary, None);

        assert_eq!(combined.documents.len(), 1);
        assert_eq!(combined.documents[0].document_id, "madi-document");
        assert_eq!(
            combined.next_server_change_token.as_deref(),
            Some("madi-token")
        );
    }
}
