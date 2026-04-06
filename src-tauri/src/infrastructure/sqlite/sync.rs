use std::collections::{HashMap, HashSet};

use std::thread;
use std::time::Duration;

use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};

use crate::domain::models::{
    Block, BlockKind, Document, ICloudAccountStatus, ICloudSyncState, ICloudSyncStatus,
};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{
    ApplyOperationsRequest, ApplyOperationsResponse, BridgeBlockRecord, BridgeBlockTombstoneRecord,
    BridgeDocumentRecord, BridgeDocumentTombstoneRecord, CloudKitBridge, FetchChangesRequest,
    FetchChangesResponse,
};

use super::*;

const TOMBSTONE_RETENTION_MS: i64 = 30 * 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncEntityType {
    Document,
    Block,
    DocumentTombstone,
    BlockTombstone,
}

impl SyncEntityType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Document => "document",
            Self::Block => "block",
            Self::DocumentTombstone => "document_tombstone",
            Self::BlockTombstone => "block_tombstone",
        }
    }

    fn try_from_str(value: &str) -> Result<Self, AppError> {
        match value {
            "document" => Ok(Self::Document),
            "block" => Ok(Self::Block),
            "document_tombstone" => Ok(Self::DocumentTombstone),
            "block_tombstone" => Ok(Self::BlockTombstone),
            _ => Err(AppError::validation(format!(
                "알 수 없는 동기화 엔터티입니다: {value}"
            ))),
        }
    }

    fn record_name(self, entity_id: &str) -> String {
        match self {
            Self::Document => format!("doc:{entity_id}"),
            Self::Block => format!("blk:{entity_id}"),
            Self::DocumentTombstone => format!("dt:{entity_id}"),
            Self::BlockTombstone => format!("bt:{entity_id}"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncOperationType {
    DocumentCreated,
    DocumentTouched,
    DocumentRenamed,
    DocumentStyleUpdated,
    DocumentDeleted,
    DocumentRestored,
    DocumentOrderingUpdated,
    BlockCreated,
    BlockContentUpdated,
    BlockKindChanged,
    BlockMoved,
    BlockDeleted,
}

#[allow(dead_code)]
impl SyncOperationType {
    fn as_str(self) -> &'static str {
        match self {
            Self::DocumentCreated => "document_created",
            Self::DocumentTouched => "document_touched",
            Self::DocumentRenamed => "document_renamed",
            Self::DocumentStyleUpdated => "document_style_updated",
            Self::DocumentDeleted => "document_deleted",
            Self::DocumentRestored => "document_restored",
            Self::DocumentOrderingUpdated => "document_ordering_updated",
            Self::BlockCreated => "block_created",
            Self::BlockContentUpdated => "block_content_updated",
            Self::BlockKindChanged => "block_kind_changed",
            Self::BlockMoved => "block_moved",
            Self::BlockDeleted => "block_deleted",
        }
    }

    fn try_from_str(value: &str) -> Result<Self, AppError> {
        match value {
            "document_created" => Ok(Self::DocumentCreated),
            "document_touched" => Ok(Self::DocumentTouched),
            "document_renamed" => Ok(Self::DocumentRenamed),
            "document_style_updated" => Ok(Self::DocumentStyleUpdated),
            "document_deleted" => Ok(Self::DocumentDeleted),
            "document_restored" => Ok(Self::DocumentRestored),
            "document_ordering_updated" => Ok(Self::DocumentOrderingUpdated),
            "block_created" => Ok(Self::BlockCreated),
            "block_content_updated" => Ok(Self::BlockContentUpdated),
            "block_kind_changed" => Ok(Self::BlockKindChanged),
            "block_moved" => Ok(Self::BlockMoved),
            "block_deleted" => Ok(Self::BlockDeleted),
            _ => Err(AppError::validation(format!(
                "알 수 없는 동기화 operation입니다: {value}"
            ))),
        }
    }

    fn is_document_active(self) -> bool {
        matches!(
            self,
            Self::DocumentCreated
                | Self::DocumentTouched
                | Self::DocumentRenamed
                | Self::DocumentStyleUpdated
                | Self::DocumentRestored
        )
    }

    fn is_document_deleted(self) -> bool {
        matches!(self, Self::DocumentDeleted)
    }

    fn is_block_active(self) -> bool {
        matches!(
            self,
            Self::BlockCreated
                | Self::BlockContentUpdated
                | Self::BlockKindChanged
                | Self::BlockMoved
        )
    }

    fn is_block_deleted(self) -> bool {
        matches!(self, Self::BlockDeleted)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncOperationStatus {
    Pending,
    Processing,
    Failed,
    Superseded,
}

impl SyncOperationStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Processing => "processing",
            Self::Failed => "failed",
            Self::Superseded => "superseded",
        }
    }

    fn try_from_str(value: &str) -> Result<Self, AppError> {
        match value {
            "pending" => Ok(Self::Pending),
            "processing" => Ok(Self::Processing),
            "failed" => Ok(Self::Failed),
            "superseded" => Ok(Self::Superseded),
            _ => Err(AppError::validation(format!(
                "알 수 없는 동기화 상태입니다: {value}"
            ))),
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct SyncOperationRow {
    id: i64,
    operation_type: SyncOperationType,
    entity_type: SyncEntityType,
    entity_id: String,
    document_id: Option<String>,
    payload_json: Value,
    logical_clock: i64,
    status: SyncOperationStatus,
}

#[derive(Debug, Clone)]
struct TombstoneRow {
    entity_id: String,
    parent_document_id: Option<String>,
    deleted_at_ms: i64,
    deleted_by_device_id: String,
}

#[derive(Debug, Clone)]
struct StoredCloudKitState {
    server_change_token: Option<String>,
    last_sync_started_at_ms: Option<i64>,
    last_sync_succeeded_at_ms: Option<i64>,
    last_error_code: Option<String>,
    last_error_message: Option<String>,
    account_status: ICloudAccountStatus,
    sync_enabled: bool,
}

#[derive(Debug, Clone)]
struct DocumentSyncStateRow {
    last_projected_updated_at_ms: Option<i64>,
    last_uploaded_success_at_ms: Option<i64>,
}

pub(crate) struct SyncDebugSnapshot {
    pub pending_operation_count: usize,
    pub processing_operation_count: usize,
    pub failed_operation_count: usize,
    pub tombstone_count: usize,
    pub server_change_token_present: bool,
    pub device_id: String,
    pub coalesced_intent_count: usize,
}

pub(crate) struct BuiltApplyOperations {
    request: ApplyOperationsRequest,
    record_names_by_operation_id: HashMap<i64, HashSet<String>>,
    operation_contexts: HashMap<i64, BuiltOperationContext>,
    document_projection_versions: HashMap<String, i64>,
    #[allow(dead_code)]
    coalesced_intent_count: usize,
}

#[derive(Debug, Clone)]
struct BuiltOperationContext {
    document_id: Option<String>,
    clears_document_sync_state: bool,
}

#[derive(Default)]
struct CoalescedSyncPlan {
    document_upserts: HashMap<String, SyncOperationRow>,
    document_deletes: HashMap<String, SyncOperationRow>,
    document_ordering_upserts: HashMap<String, SyncOperationRow>,
    block_upserts: HashMap<String, SyncOperationRow>,
    block_deletes: HashMap<String, SyncOperationRow>,
}

pub(crate) enum SyncRunPreparation {
    Disabled(ICloudSyncStatus),
    Ready {
        server_change_token: Option<String>,
    },
}

impl BuiltApplyOperations {
    pub(crate) fn request(&self) -> &ApplyOperationsRequest {
        &self.request
    }

    pub(crate) fn has_operations(&self) -> bool {
        self.request.has_operations()
    }

    #[cfg(test)]
    pub(crate) fn coalesced_intent_count(&self) -> usize {
        self.coalesced_intent_count
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct ApplyResponseStats {
    failed_count: usize,
}

impl SqliteStore {
    pub(crate) fn begin_icloud_sync_run(&mut self) -> Result<SyncRunPreparation, AppError> {
        self.cleanup_orphaned_sync_operations()?;
        self.connection.execute(
            "DELETE FROM sync_operations WHERE status = 'superseded'",
            [],
        )?;
        let stored = self.read_cloudkit_state()?;
        if !stored.sync_enabled {
            return Ok(SyncRunPreparation::Disabled(self.get_icloud_sync_status()?));
        }

        let started_at = Self::now();
        self.connection.execute(
            "UPDATE cloudkit_state
       SET last_sync_started_at_ms = ?1,
           last_error_code = NULL,
           last_error_message = NULL
       WHERE scope = ?2",
            params![started_at, ICLOUD_SCOPE_PRIVATE],
        )?;

        Ok(SyncRunPreparation::Ready {
            server_change_token: stored.server_change_token,
        })
    }

    pub(crate) fn handle_unavailable_account_status(
        &mut self,
        account_status: ICloudAccountStatus,
    ) -> Result<ICloudSyncStatus, AppError> {
        self.set_cloudkit_account_status(account_status.clone())?;
        let message = match account_status {
            ICloudAccountStatus::NoAccount => "iCloud 계정에 로그인되어 있지 않습니다.",
            ICloudAccountStatus::Restricted => "현재 iCloud 동기화를 사용할 수 없습니다.",
            ICloudAccountStatus::TemporarilyUnavailable => "iCloud 상태를 잠시 확인할 수 없습니다.",
            ICloudAccountStatus::CouldNotDetermine => "iCloud 계정 상태를 확인하지 못했습니다.",
            _ => "iCloud 계정을 사용할 수 없습니다.",
        };
        self.mark_sync_error("account_unavailable", message)?;
        self.get_icloud_sync_status()
    }

    pub(crate) fn apply_remote_changes_and_build_operations(
        &mut self,
        changes: &FetchChangesResponse,
    ) -> Result<BuiltApplyOperations, AppError> {
        self.apply_remote_changes(changes)?;
        self.queue_unsynced_documents_for_upload()?;
        self.build_coalesced_sync_plan()
    }

    pub(crate) fn complete_icloud_sync_run(
        &mut self,
        account_status: ICloudAccountStatus,
        changes: &FetchChangesResponse,
        built: &BuiltApplyOperations,
        response: Option<&ApplyOperationsResponse>,
    ) -> Result<ICloudSyncStatus, AppError> {
        let mut apply_stats = ApplyResponseStats::default();
        if let Some(response) = response {
            apply_stats = self.process_apply_response(built, response)?;
            self.apply_remote_changes(&FetchChangesResponse {
                documents: response.server_changed.documents.clone(),
                blocks: response.server_changed.blocks.clone(),
                document_tombstones: response.server_changed.document_tombstones.clone(),
                block_tombstones: response.server_changed.block_tombstones.clone(),
                next_server_change_token: None,
            })?;
        }

        if let Some(token) = &changes.next_server_change_token {
            self.connection.execute(
                "UPDATE cloudkit_state
         SET server_change_token = ?1
         WHERE scope = ?2",
                params![token, ICLOUD_SCOPE_PRIVATE],
            )?;
        }

        self.purge_expired_tombstones(Self::now())?;
        self.ensure_sync_completion_succeeded(apply_stats)?;
        self.mark_sync_success(account_status)?;
        self.get_icloud_sync_status()
    }

    pub(crate) fn finish_failed_icloud_sync(
        &mut self,
        error: &AppError,
    ) -> Result<ICloudSyncStatus, AppError> {
        let (category, message) = classify_sync_error(error);
        self.fail_processing_operations(category.as_code())?;
        self.mark_sync_error(category.as_code(), &message)?;
        self.get_icloud_sync_status()
    }

    pub(crate) fn ensure_cloudkit_state_row(&self) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO cloudkit_state (
         scope,
         zone_name,
         server_change_token,
         last_sync_started_at_ms,
         last_sync_succeeded_at_ms,
         last_error_code,
         last_error_message,
         account_status,
         sync_enabled
       ) VALUES (?1, ?2, NULL, NULL, NULL, NULL, NULL, ?3, 0)
       ON CONFLICT(scope) DO NOTHING",
            params![
                ICLOUD_SCOPE_PRIVATE,
                ICLOUD_ZONE_NAME,
                ICloudAccountStatus::Unknown.as_str()
            ],
        )?;
        Ok(())
    }

    pub(crate) fn ensure_device_state_row(&self) -> Result<(), AppError> {
        let existing = self
            .connection
            .query_row(
                "SELECT device_id FROM device_state WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if existing.is_none() {
            self.connection.execute(
                "INSERT INTO device_state (id, device_id) VALUES (1, ?1)",
                params![Self::new_id()],
            )?;
        }

        Ok(())
    }

    pub(crate) fn ensure_sync_operations_defaults(&self) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE sync_operations
       SET status = 'pending'
       WHERE status = 'processing'
          OR status NOT IN ('pending', 'processing', 'failed', 'superseded')",
            [],
        )?;
        Ok(())
    }

    pub(crate) fn migrate_legacy_sync_outbox_to_operations(&self) -> Result<(), AppError> {
        let legacy_count =
            self.connection
                .query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| {
                    row.get::<_, i64>(0)
                })?;
        if legacy_count == 0 {
            return Ok(());
        }

        let rows = self
            .connection
            .prepare(
                "SELECT entity_type, entity_id, op, queued_at_ms, attempt_count, last_error_code
         FROM sync_outbox
         ORDER BY queued_at_ms ASC, id ASC",
            )?
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (entity_type_raw, entity_id, op_raw, queued_at_ms, attempt_count, last_error_code) in
            rows
        {
            let entity_type = SyncEntityType::try_from_str(&entity_type_raw)?;
            let operation_type = match (entity_type, op_raw.as_str()) {
                (SyncEntityType::Document, _) => SyncOperationType::DocumentTouched,
                (SyncEntityType::Block, _) => SyncOperationType::BlockContentUpdated,
                (SyncEntityType::DocumentTombstone, _) => SyncOperationType::DocumentDeleted,
                (SyncEntityType::BlockTombstone, _) => SyncOperationType::BlockDeleted,
            };
            let document_id = match entity_type {
                SyncEntityType::Document => Some(entity_id.clone()),
                SyncEntityType::Block => self
                    .fetch_block(&entity_id)
                    .ok()
                    .map(|block| block.document_id),
                SyncEntityType::DocumentTombstone => Some(entity_id.clone()),
                SyncEntityType::BlockTombstone => self
                    .read_tombstone(SyncEntityType::BlockTombstone, &entity_id)?
                    .and_then(|row| row.parent_document_id),
            };
            if matches!(
                entity_type,
                SyncEntityType::DocumentTombstone | SyncEntityType::BlockTombstone
            ) && document_id.is_none()
            {
                continue;
            }
            self.connection.execute(
                "INSERT INTO sync_operations (
           operation_type,
           entity_type,
           entity_id,
           document_id,
           payload_json,
           logical_clock,
           created_at_ms,
           attempt_count,
           last_error_code,
           status
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    operation_type.as_str(),
                    entity_type.as_str(),
                    entity_id,
                    document_id,
                    json!({ "migratedFrom": "sync_outbox", "legacyOp": op_raw }).to_string(),
                    queued_at_ms,
                    queued_at_ms,
                    attempt_count,
                    last_error_code,
                    if last_error_code.is_some() {
                        SyncOperationStatus::Failed.as_str()
                    } else {
                        SyncOperationStatus::Pending.as_str()
                    },
                ],
            )?;
        }

        self.connection.execute("DELETE FROM sync_outbox", [])?;
        Ok(())
    }

    pub(crate) fn cleanup_orphaned_sync_operations(&self) -> Result<(), AppError> {
        let operations = self.list_sync_operations_with_statuses(&["pending", "processing", "failed"])?;
        let mut delete_ids = Vec::new();

        for operation in operations {
            let is_orphaned = match operation.entity_type {
                SyncEntityType::DocumentTombstone => self
                    .read_tombstone(SyncEntityType::DocumentTombstone, &operation.entity_id)?
                    .is_none(),
                SyncEntityType::BlockTombstone => self
                    .read_tombstone(SyncEntityType::BlockTombstone, &operation.entity_id)?
                    .is_none(),
                SyncEntityType::Document => {
                    self.get_document(&operation.entity_id)?.is_none()
                        && !matches!(operation.operation_type, SyncOperationType::DocumentDeleted)
                }
                SyncEntityType::Block => {
                    self.fetch_block(&operation.entity_id).is_err()
                        && !matches!(operation.operation_type, SyncOperationType::BlockDeleted)
                }
            };

            let migrated_legacy = operation
                .payload_json
                .get("migratedFrom")
                .and_then(Value::as_str)
                == Some("sync_outbox");

            if is_orphaned || (migrated_legacy && operation.document_id.is_none()) {
                delete_ids.push(operation.id);
            }
        }

        for operation_id in delete_ids {
            self.connection.execute(
                "DELETE FROM sync_operations WHERE id = ?1",
                params![operation_id],
            )?;
        }

        Ok(())
    }

    pub(crate) fn current_device_id(&self) -> Result<String, AppError> {
        self.connection
            .query_row(
                "SELECT device_id FROM device_state WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| AppError::validation("device id를 찾을 수 없습니다."))
    }

    pub(crate) fn get_icloud_sync_status(&self) -> Result<ICloudSyncStatus, AppError> {
        let stored = self.read_cloudkit_state()?;
        let pending_operation_count = self.count_pending_operations()?;
        let state = if !stored.sync_enabled {
            ICloudSyncState::Disabled
        } else if matches!(
            stored.last_error_code.as_deref(),
            Some("offline" | "network")
        ) {
            ICloudSyncState::Offline
        } else if stored.last_error_message.is_some() {
            ICloudSyncState::Error
        } else if pending_operation_count > 0 {
            ICloudSyncState::Pending
        } else {
            ICloudSyncState::Idle
        };

        Ok(ICloudSyncStatus {
            enabled: stored.sync_enabled,
            state,
            account_status: stored.account_status,
            pending_operation_count,
            last_sync_started_at_ms: stored.last_sync_started_at_ms,
            last_sync_succeeded_at_ms: stored.last_sync_succeeded_at_ms,
            last_error_code: stored.last_error_code,
            last_error_message: stored.last_error_message,
        })
    }

    pub(crate) fn get_icloud_sync_debug_info(&self) -> Result<SyncDebugSnapshot, AppError> {
        let pending_operation_count = self.connection.query_row(
            "SELECT COUNT(*) FROM sync_operations WHERE status = 'pending'",
            [],
            |row| row.get::<_, i64>(0),
        )? as usize;
        let processing_operation_count = self.connection.query_row(
            "SELECT COUNT(*) FROM sync_operations WHERE status = 'processing'",
            [],
            |row| row.get::<_, i64>(0),
        )? as usize;
        let failed_operation_count = self.connection.query_row(
            "SELECT COUNT(*) FROM sync_operations WHERE status = 'failed'",
            [],
            |row| row.get::<_, i64>(0),
        )? as usize;
        let tombstone_count =
            self.connection
                .query_row("SELECT COUNT(*) FROM sync_tombstones", [], |row| {
                    row.get::<_, i64>(0)
                })? as usize;
        let state = self.read_cloudkit_state()?;
        let device_id = self.current_device_id()?;
        Ok(SyncDebugSnapshot {
            pending_operation_count,
            processing_operation_count,
            failed_operation_count,
            tombstone_count,
            server_change_token_present: state.server_change_token.is_some(),
            device_id,
            coalesced_intent_count: self.preview_coalesced_intent_count()?,
        })
    }

    pub(crate) fn set_icloud_sync_enabled(
        &mut self,
        enabled: bool,
    ) -> Result<ICloudSyncStatus, AppError> {
        self.connection.execute(
            "UPDATE cloudkit_state
       SET sync_enabled = ?1,
           last_error_code = CASE WHEN ?1 = 0 THEN NULL ELSE last_error_code END,
           last_error_message = CASE WHEN ?1 = 0 THEN NULL ELSE last_error_message END
       WHERE scope = ?2",
            params![if enabled { 1 } else { 0 }, ICLOUD_SCOPE_PRIVATE],
        )?;
        self.get_icloud_sync_status()
    }

    #[allow(dead_code)]
    pub(crate) fn run_icloud_sync(
        &mut self,
        bridge: &CloudKitBridge,
    ) -> Result<ICloudSyncStatus, AppError> {
        let stored = self.read_cloudkit_state()?;
        if !stored.sync_enabled {
            return self.get_icloud_sync_status();
        }

        let started_at = Self::now();
        self.connection.execute(
            "UPDATE cloudkit_state
       SET last_sync_started_at_ms = ?1,
           last_error_code = NULL,
           last_error_message = NULL
       WHERE scope = ?2",
            params![started_at, ICLOUD_SCOPE_PRIVATE],
        )?;

        let account_status = bridge.get_account_status()?;
        self.set_cloudkit_account_status(account_status.clone())?;

        if account_status != ICloudAccountStatus::Available {
            let message = match account_status {
                ICloudAccountStatus::NoAccount => "iCloud 계정에 로그인되어 있지 않습니다.",
                ICloudAccountStatus::Restricted => "현재 iCloud 동기화를 사용할 수 없습니다.",
                ICloudAccountStatus::TemporarilyUnavailable => {
                    "iCloud 상태를 잠시 확인할 수 없습니다."
                }
                ICloudAccountStatus::CouldNotDetermine => "iCloud 계정 상태를 확인하지 못했습니다.",
                _ => "iCloud 계정을 사용할 수 없습니다.",
            };
            self.mark_sync_error("account_unavailable", message)?;
            return self.get_icloud_sync_status();
        }

        bridge.ensure_zone(ICLOUD_ZONE_NAME)?;

        let current_state = self.read_cloudkit_state()?;
        let changes = self.fetch_remote_changes_with_zone_retry(
            bridge,
            current_state.server_change_token.clone(),
        )?;
        self.apply_remote_changes(&changes)?;
        self.queue_unsynced_documents_for_upload()?;

        let built = self.build_coalesced_sync_plan()?;
        let mut apply_stats = ApplyResponseStats::default();
        if built.request.has_operations() {
            let response = bridge.apply_operations(&built.request)?;
            apply_stats = self.process_apply_response(&built, &response)?;
            self.apply_remote_changes(&FetchChangesResponse {
                documents: response.server_changed.documents.clone(),
                blocks: response.server_changed.blocks.clone(),
                document_tombstones: response.server_changed.document_tombstones.clone(),
                block_tombstones: response.server_changed.block_tombstones.clone(),
                next_server_change_token: None,
            })?;
        }

        if let Some(token) = changes.next_server_change_token {
            self.connection.execute(
                "UPDATE cloudkit_state
         SET server_change_token = ?1
         WHERE scope = ?2",
                params![token, ICLOUD_SCOPE_PRIVATE],
            )?;
        }

        self.purge_expired_tombstones(Self::now())?;
        self.ensure_sync_completion_succeeded(apply_stats)?;
        self.mark_sync_success(account_status)?;
        self.get_icloud_sync_status()
    }

    #[allow(dead_code)]
    fn fetch_remote_changes_with_zone_retry(
        &self,
        bridge: &CloudKitBridge,
        server_change_token: Option<String>,
    ) -> Result<FetchChangesResponse, AppError> {
        let request = FetchChangesRequest {
            zone_name: ICLOUD_ZONE_NAME.to_string(),
            server_change_token,
        };

        match bridge.fetch_changes(&request) {
            Ok(changes) => Ok(changes),
            Err(AppError::Validation(message)) if message.contains("Zone does not exist") => {
                thread::sleep(Duration::from_secs(3));
                bridge.fetch_changes(&request)
            }
            Err(error) => Err(error),
        }
    }

    pub(crate) fn purge_expired_tombstones(&mut self, now_ms: i64) -> Result<(), AppError> {
        let expired = self
            .connection
            .prepare(
                "SELECT entity_type, entity_id
         FROM sync_tombstones
         WHERE purge_after_ms <= ?1",
            )?
            .query_map(params![now_ms], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (entity_type, entity_id) in expired {
            let entity_type = SyncEntityType::try_from_str(&entity_type)?;
            let operation_type = match entity_type {
                SyncEntityType::Document => SyncOperationType::DocumentTouched,
                SyncEntityType::Block => SyncOperationType::BlockContentUpdated,
                SyncEntityType::DocumentTombstone => SyncOperationType::DocumentDeleted,
                SyncEntityType::BlockTombstone => SyncOperationType::BlockDeleted,
            };
            let document_id = match entity_type {
                SyncEntityType::Document | SyncEntityType::DocumentTombstone => {
                    Some(entity_id.clone())
                }
                SyncEntityType::Block => self
                    .fetch_block(&entity_id)
                    .ok()
                    .map(|block| block.document_id),
                SyncEntityType::BlockTombstone => self
                    .read_tombstone(SyncEntityType::BlockTombstone, &entity_id)?
                    .and_then(|row| row.parent_document_id),
            };
            self.enqueue_sync_operation(
                operation_type,
                entity_type,
                &entity_id,
                document_id.as_deref(),
                json!({ "purged": true }),
                now_ms,
            )?;
            self.connection.execute(
                "DELETE FROM sync_tombstones WHERE entity_type = ?1 AND entity_id = ?2",
                params![entity_type.as_str(), entity_id],
            )?;
        }

        Ok(())
    }

    fn queue_all_active_documents_for_sync(&mut self) -> Result<(), AppError> {
        let document_ids = self
            .connection
            .prepare(
                "SELECT id
         FROM documents
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC",
            )?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        for document_id in document_ids {
            self.enqueue_document_projection_operations(&document_id)?;
        }

        Ok(())
    }

    fn queue_unsynced_documents_for_upload(&mut self) -> Result<(), AppError> {
        let document_ids = self
            .connection
            .prepare(
                "SELECT id
         FROM documents
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC",
            )?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        for document_id in document_ids {
            if !self.document_needs_cloud_projection(&document_id)? {
                continue;
            }
            self.enqueue_document_projection_operations(&document_id)?;
        }

        Ok(())
    }

    fn document_needs_cloud_projection(&self, document_id: &str) -> Result<bool, AppError> {
        let Some(document) = self.get_document(document_id)? else {
            return Ok(false);
        };

        if document.deleted_at.is_some() || self.document_has_active_sync_work(document_id)? {
            return Ok(false);
        }

        let sync_state = self.read_document_sync_state(document_id)?;
        let Some(sync_state) = sync_state else {
            return Ok(true);
        };

        Ok(sync_state.last_uploaded_success_at_ms.is_none()
            || sync_state.last_projected_updated_at_ms.unwrap_or_default() < document.updated_at)
    }

    fn document_has_active_sync_work(&self, document_id: &str) -> Result<bool, AppError> {
        let has_work = self.connection.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM sync_operations
               WHERE status IN ('pending', 'processing', 'failed')
                 AND (
                   document_id = ?1
                   OR (entity_type IN ('document', 'document_tombstone') AND entity_id = ?1)
                 )
             )",
            params![document_id],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(has_work > 0)
    }

    fn read_document_sync_state(
        &self,
        document_id: &str,
    ) -> Result<Option<DocumentSyncStateRow>, AppError> {
        self.connection
            .query_row(
                "SELECT last_projected_updated_at_ms, last_uploaded_success_at_ms
         FROM document_sync_state
         WHERE document_id = ?1",
                params![document_id],
                |row| {
                    Ok(DocumentSyncStateRow {
                        last_projected_updated_at_ms: row.get(0)?,
                        last_uploaded_success_at_ms: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    fn upsert_document_sync_state(
        &self,
        document_id: &str,
        last_projected_updated_at_ms: i64,
        last_uploaded_success_at_ms: i64,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO document_sync_state (
         document_id,
         last_projected_updated_at_ms,
         last_uploaded_success_at_ms
       ) VALUES (?1, ?2, ?3)
       ON CONFLICT(document_id) DO UPDATE SET
         last_projected_updated_at_ms = excluded.last_projected_updated_at_ms,
         last_uploaded_success_at_ms = excluded.last_uploaded_success_at_ms",
            params![
                document_id,
                last_projected_updated_at_ms,
                last_uploaded_success_at_ms
            ],
        )?;
        Ok(())
    }

    fn clear_document_sync_state(&self, document_id: &str) -> Result<(), AppError> {
        self.connection.execute(
            "DELETE FROM document_sync_state WHERE document_id = ?1",
            params![document_id],
        )?;
        Ok(())
    }

    pub(crate) fn record_document_created(&mut self, document_id: &str) -> Result<(), AppError> {
        let logical_clock = self
            .get_document(document_id)?
            .map(|document| document.updated_at)
            .unwrap_or_else(Self::now);
        self.clear_document_tombstones(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::DocumentCreated,
            SyncEntityType::Document,
            document_id,
            Some(document_id),
            json!({}),
            logical_clock,
        )
    }

    pub(crate) fn record_document_renamed(&mut self, document_id: &str) -> Result<(), AppError> {
        let document = self
            .get_document(document_id)?
            .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))?;
        self.enqueue_sync_operation(
            SyncOperationType::DocumentRenamed,
            SyncEntityType::Document,
            document_id,
            Some(document_id),
            json!({ "title": document.title }),
            document.updated_at,
        )
    }

    pub(crate) fn record_document_style_updated(
        &mut self,
        document_id: &str,
    ) -> Result<(), AppError> {
        let document = self
            .get_document(document_id)?
            .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))?;
        self.enqueue_sync_operation(
      SyncOperationType::DocumentStyleUpdated,
      SyncEntityType::Document,
      document_id,
      Some(document_id),
      json!({
        "blockTintOverride": document.block_tint_override.map(|value| value.as_str().to_string()),
        "documentSurfaceToneOverride": document.document_surface_tone_override.map(|value| value.as_str().to_string()),
      }),
      document.updated_at,
    )
    }

    pub(crate) fn record_document_touch(&mut self, document_id: &str) -> Result<(), AppError> {
        let logical_clock = self
            .get_document(document_id)?
            .map(|document| document.updated_at)
            .unwrap_or_else(Self::now);
        self.enqueue_sync_operation(
            SyncOperationType::DocumentTouched,
            SyncEntityType::Document,
            document_id,
            Some(document_id),
            json!({}),
            logical_clock,
        )
    }

    pub(crate) fn record_document_ordering_updated(
        &mut self,
        document_id: &str,
    ) -> Result<(), AppError> {
        let logical_clock = self
            .get_document(document_id)?
            .map(|document| document.updated_at)
            .unwrap_or_else(Self::now);
        let ordered_block_ids = self
            .list_blocks(document_id)?
            .into_iter()
            .map(|block| block.id)
            .collect::<Vec<_>>();
        self.enqueue_sync_operation(
            SyncOperationType::DocumentOrderingUpdated,
            SyncEntityType::Document,
            document_id,
            Some(document_id),
            json!({
              "orderedBlockIds": ordered_block_ids,
              "updatedByDeviceId": self.current_device_id()?,
            }),
            logical_clock,
        )
    }

    pub(crate) fn enqueue_document_projection_operations(
        &mut self,
        document_id: &str,
    ) -> Result<(), AppError> {
        let document = match self.get_document(document_id)? {
            Some(document) => document,
            None => return Ok(()),
        };

        if document.deleted_at.is_some() {
            return self.record_document_deletion(
                document_id,
                document.deleted_at.unwrap_or_else(Self::now),
            );
        }

        self.clear_document_tombstones(document_id)?;
        self.record_document_touch(document_id)?;
        self.record_document_ordering_updated(document_id)?;

        for block in self.list_blocks(document_id)? {
            self.clear_block_tombstone(&block.id)?;
            self.enqueue_sync_operation(
                SyncOperationType::BlockContentUpdated,
                SyncEntityType::Block,
                &block.id,
                Some(document_id),
                json!({}),
                block.updated_at,
            )?;
        }

        Ok(())
    }

    pub(crate) fn record_document_deletion(
        &mut self,
        document_id: &str,
        deleted_at_ms: i64,
    ) -> Result<(), AppError> {
        let device_id = self.current_device_id()?;
        let blocks = self.list_blocks(document_id)?;
        self.clear_document_sync_state(document_id)?;

        self.connection.execute(
            "UPDATE documents
       SET updated_by_device_id = ?1
       WHERE id = ?2",
            params![device_id, document_id],
        )?;

        self.upsert_tombstone(
            SyncEntityType::DocumentTombstone,
            document_id,
            None,
            deleted_at_ms,
            &self.current_device_id()?,
        )?;
        self.enqueue_sync_operation(
            SyncOperationType::DocumentDeleted,
            SyncEntityType::DocumentTombstone,
            document_id,
            Some(document_id),
            json!({ "deletedAtMs": deleted_at_ms }),
            deleted_at_ms,
        )?;

        for block in blocks {
            self.upsert_tombstone(
                SyncEntityType::BlockTombstone,
                &block.id,
                Some(document_id),
                deleted_at_ms,
                &self.current_device_id()?,
            )?;
            self.enqueue_sync_operation(
                SyncOperationType::BlockDeleted,
                SyncEntityType::BlockTombstone,
                &block.id,
                Some(document_id),
                json!({ "deletedAtMs": deleted_at_ms }),
                deleted_at_ms,
            )?;
        }

        Ok(())
    }

    pub(crate) fn record_document_restored(&mut self, document_id: &str) -> Result<(), AppError> {
        self.clear_document_tombstones(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::DocumentRestored,
            SyncEntityType::Document,
            document_id,
            Some(document_id),
            json!({}),
            self.get_document(document_id)?
                .map(|document| document.updated_at)
                .unwrap_or_else(Self::now),
        )?;

        for block in self.list_blocks(document_id)? {
            self.clear_block_tombstone(&block.id)?;
            self.enqueue_sync_operation(
                SyncOperationType::BlockCreated,
                SyncEntityType::Block,
                &block.id,
                Some(document_id),
                json!({}),
                block.updated_at,
            )?;
        }

        self.record_document_ordering_updated(document_id)?;

        Ok(())
    }

    pub(crate) fn record_block_created(
        &mut self,
        block_id: &str,
        document_id: &str,
    ) -> Result<(), AppError> {
        let block = self.fetch_block(block_id)?;
        self.clear_block_tombstone(block_id)?;
        self.record_document_touch(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::BlockCreated,
            SyncEntityType::Block,
            block_id,
            Some(document_id),
            json!({ "position": block.position }),
            block.updated_at,
        )?;
        self.record_document_ordering_updated(document_id)
    }

    pub(crate) fn record_block_content_updated(
        &mut self,
        block_id: &str,
        document_id: &str,
    ) -> Result<(), AppError> {
        let block = self.fetch_block(block_id)?;
        self.record_document_touch(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::BlockContentUpdated,
            SyncEntityType::Block,
            block_id,
            Some(document_id),
            json!({}),
            block.updated_at,
        )
    }

    pub(crate) fn record_block_kind_changed(
        &mut self,
        block_id: &str,
        document_id: &str,
    ) -> Result<(), AppError> {
        let block = self.fetch_block(block_id)?;
        self.record_document_touch(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::BlockKindChanged,
            SyncEntityType::Block,
            block_id,
            Some(document_id),
            json!({ "kind": block.kind.as_str() }),
            block.updated_at,
        )
    }

    pub(crate) fn record_block_deletion(
        &mut self,
        block_id: &str,
        document_id: &str,
        deleted_at_ms: i64,
    ) -> Result<(), AppError> {
        self.upsert_tombstone(
            SyncEntityType::BlockTombstone,
            block_id,
            Some(document_id),
            deleted_at_ms,
            &self.current_device_id()?,
        )?;
        self.record_document_touch(document_id)?;
        self.enqueue_sync_operation(
            SyncOperationType::BlockDeleted,
            SyncEntityType::BlockTombstone,
            block_id,
            Some(document_id),
            json!({ "deletedAtMs": deleted_at_ms }),
            deleted_at_ms,
        )?;
        self.record_document_ordering_updated(document_id)
    }

    pub(crate) fn reset_icloud_sync_checkpoint(&mut self) -> Result<ICloudSyncStatus, AppError> {
        self.connection.execute(
            "UPDATE cloudkit_state
       SET server_change_token = NULL,
           last_error_code = NULL,
           last_error_message = NULL
       WHERE scope = ?1",
            params![ICLOUD_SCOPE_PRIVATE],
        )?;
        self.get_icloud_sync_status()
    }

    pub(crate) fn force_upload_all_documents(&mut self) -> Result<ICloudSyncStatus, AppError> {
        self.queue_all_active_documents_for_sync()?;
        self.get_icloud_sync_status()
    }

    pub(crate) fn force_redownload_from_cloud(&mut self) -> Result<ICloudSyncStatus, AppError> {
        self.connection.execute("DELETE FROM sync_operations", [])?;
        self.connection.execute("DELETE FROM sync_tombstones", [])?;
        self.connection.execute("DELETE FROM document_sync_state", [])?;
        self.connection
            .execute(&format!("DELETE FROM {SEARCH_INDEX_TABLE}"), [])?;
        self.connection.execute("DELETE FROM blocks", [])?;
        self.connection.execute("DELETE FROM documents", [])?;
        self.connection.execute(
            "UPDATE cloudkit_state
       SET server_change_token = NULL,
           last_error_code = NULL,
           last_error_message = NULL
       WHERE scope = ?1",
            params![ICLOUD_SCOPE_PRIVATE],
        )?;
        self.get_icloud_sync_status()
    }

    fn clear_document_tombstones(&self, document_id: &str) -> Result<(), AppError> {
        self.connection.execute(
            "DELETE FROM sync_tombstones
       WHERE (entity_type = ?1 AND entity_id = ?2)
          OR (entity_type = ?3 AND parent_document_id = ?2)",
            params![
                SyncEntityType::DocumentTombstone.as_str(),
                document_id,
                SyncEntityType::BlockTombstone.as_str(),
            ],
        )?;
        Ok(())
    }

    fn clear_block_tombstone(&self, block_id: &str) -> Result<(), AppError> {
        self.connection.execute(
            "DELETE FROM sync_tombstones WHERE entity_type = ?1 AND entity_id = ?2",
            params![SyncEntityType::BlockTombstone.as_str(), block_id],
        )?;
        Ok(())
    }

    fn enqueue_sync_operation(
        &self,
        operation_type: SyncOperationType,
        entity_type: SyncEntityType,
        entity_id: &str,
        document_id: Option<&str>,
        payload_json: Value,
        logical_clock: i64,
    ) -> Result<(), AppError> {
        self.supersede_existing_operations(operation_type, entity_type, entity_id)?;
        self.connection.execute(
            "INSERT INTO sync_operations (
         operation_type,
         entity_type,
         entity_id,
         document_id,
         payload_json,
         logical_clock,
         created_at_ms,
         attempt_count,
         last_error_code,
         status
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL, ?8)",
            params![
                operation_type.as_str(),
                entity_type.as_str(),
                entity_id,
                document_id,
                payload_json.to_string(),
                logical_clock,
                Self::now(),
                SyncOperationStatus::Pending.as_str(),
            ],
        )?;
        Ok(())
    }

    fn supersede_existing_operations(
        &self,
        operation_type: SyncOperationType,
        entity_type: SyncEntityType,
        entity_id: &str,
    ) -> Result<(), AppError> {
        let predicate = match operation_type {
      SyncOperationType::DocumentDeleted => {
        "entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'processing', 'failed')"
      }
      SyncOperationType::DocumentCreated
      | SyncOperationType::DocumentTouched
      | SyncOperationType::DocumentRenamed
      | SyncOperationType::DocumentStyleUpdated
      | SyncOperationType::DocumentRestored => {
        "entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'processing', 'failed')
         AND operation_type IN (
           'document_created',
           'document_touched',
           'document_renamed',
           'document_style_updated',
           'document_restored'
         )"
      }
      SyncOperationType::DocumentOrderingUpdated => {
        "entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'processing', 'failed')
         AND operation_type IN ('document_ordering_updated', 'block_moved')"
      }
      SyncOperationType::BlockDeleted => {
        "entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'processing', 'failed')"
      }
      SyncOperationType::BlockCreated
      | SyncOperationType::BlockContentUpdated
      | SyncOperationType::BlockKindChanged
      | SyncOperationType::BlockMoved => {
        "entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'processing', 'failed')
         AND operation_type IN ('block_created', 'block_content_updated', 'block_kind_changed', 'block_moved')"
      }
    };

        self.connection.execute(
            &format!(
                "UPDATE sync_operations
         SET status = 'superseded'
         WHERE {predicate}"
            ),
            params![entity_type.as_str(), entity_id],
        )?;
        Ok(())
    }

    fn discard_pending_operations(
        &self,
        entity_type: SyncEntityType,
        entity_id: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE sync_operations
       SET status = 'superseded'
       WHERE entity_type = ?1
         AND entity_id = ?2
         AND status IN ('pending', 'processing', 'failed')",
            params![entity_type.as_str(), entity_id],
        )?;
        Ok(())
    }

    fn read_cloudkit_state(&self) -> Result<StoredCloudKitState, AppError> {
        self.connection.query_row(
      "SELECT server_change_token, last_sync_started_at_ms, last_sync_succeeded_at_ms, last_error_code, last_error_message, account_status, sync_enabled
       FROM cloudkit_state
       WHERE scope = ?1",
      params![ICLOUD_SCOPE_PRIVATE],
      |row| {
        let account_status_raw = row.get::<_, String>(5)?;
        Ok(StoredCloudKitState {
          server_change_token: row.get(0)?,
          last_sync_started_at_ms: row.get(1)?,
          last_sync_succeeded_at_ms: row.get(2)?,
          last_error_code: row.get(3)?,
          last_error_message: row.get(4)?,
          account_status: ICloudAccountStatus::try_from_str(&account_status_raw)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
          sync_enabled: row.get::<_, i64>(6)? != 0,
        })
      },
    ).map_err(AppError::from)
    }

    pub(crate) fn set_cloudkit_account_status(
        &self,
        account_status: ICloudAccountStatus,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE cloudkit_state SET account_status = ?1 WHERE scope = ?2",
            params![account_status.as_str(), ICLOUD_SCOPE_PRIVATE],
        )?;
        Ok(())
    }

    fn mark_sync_success(&self, account_status: ICloudAccountStatus) -> Result<(), AppError> {
        let now = Self::now();
        self.connection.execute(
            "UPDATE cloudkit_state
       SET account_status = ?1,
           last_sync_succeeded_at_ms = ?2,
           last_error_code = NULL,
           last_error_message = NULL
       WHERE scope = ?3",
            params![account_status.as_str(), now, ICLOUD_SCOPE_PRIVATE],
        )?;
        Ok(())
    }

    fn mark_sync_error(&self, code: &str, message: &str) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE cloudkit_state
       SET last_error_code = ?1,
           last_error_message = ?2
       WHERE scope = ?3",
            params![code, message, ICLOUD_SCOPE_PRIVATE],
        )?;
        Ok(())
    }

    fn count_pending_operations(&self) -> Result<usize, AppError> {
        let count = self.connection.query_row(
      "SELECT COUNT(*) FROM sync_operations WHERE status IN ('pending', 'processing', 'failed')",
      [],
      |row| row.get::<_, i64>(0),
    )?;
        Ok(count as usize)
    }

    fn fail_processing_operations(&self, error_code: &str) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE sync_operations
       SET attempt_count = attempt_count + 1,
           last_error_code = ?1,
           status = ?2
       WHERE status = ?3",
            params![
                error_code,
                SyncOperationStatus::Failed.as_str(),
                SyncOperationStatus::Processing.as_str(),
            ],
        )?;
        Ok(())
    }

    fn ensure_sync_completion_succeeded(
        &self,
        apply_stats: ApplyResponseStats,
    ) -> Result<(), AppError> {
        if apply_stats.failed_count > 0 {
            let message = format!(
                "iCloud 동기화 중 {}건이 실패해 대기열에 남았습니다. 다시 시도해 주세요.",
                apply_stats.failed_count
            );
            self.mark_sync_error("apply_partial_failure", &message)?;
            return Err(AppError::validation(message));
        }

        Ok(())
    }

    fn upsert_tombstone(
        &self,
        entity_type: SyncEntityType,
        entity_id: &str,
        parent_document_id: Option<&str>,
        deleted_at_ms: i64,
        deleted_by_device_id: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO sync_tombstones (
         entity_type,
         entity_id,
         parent_document_id,
         deleted_at_ms,
         deleted_by_device_id,
         purge_after_ms
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         parent_document_id = excluded.parent_document_id,
         deleted_at_ms = excluded.deleted_at_ms,
         deleted_by_device_id = excluded.deleted_by_device_id,
         purge_after_ms = excluded.purge_after_ms",
            params![
                entity_type.as_str(),
                entity_id,
                parent_document_id,
                deleted_at_ms,
                deleted_by_device_id,
                deleted_at_ms + TOMBSTONE_RETENTION_MS,
            ],
        )?;
        Ok(())
    }

    fn read_tombstone(
        &self,
        entity_type: SyncEntityType,
        entity_id: &str,
    ) -> Result<Option<TombstoneRow>, AppError> {
        self
      .connection
      .query_row(
        "SELECT entity_type, entity_id, parent_document_id, deleted_at_ms, deleted_by_device_id
         FROM sync_tombstones
         WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type.as_str(), entity_id],
        |row| {
          Ok(TombstoneRow {
            entity_id: row.get(1)?,
            parent_document_id: row.get(2)?,
            deleted_at_ms: row.get(3)?,
            deleted_by_device_id: row.get(4)?,
          })
        },
      )
      .optional()
      .map_err(AppError::from)
    }

    fn list_sync_operations(&self) -> Result<Vec<SyncOperationRow>, AppError> {
        self.list_sync_operations_with_statuses(&["pending", "failed"])
    }

    fn list_sync_operations_for_debug(&self) -> Result<Vec<SyncOperationRow>, AppError> {
        self.list_sync_operations_with_statuses(&["pending", "processing", "failed"])
    }

    fn list_sync_operations_with_statuses(
        &self,
        statuses: &[&str],
    ) -> Result<Vec<SyncOperationRow>, AppError> {
        let placeholders = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let query = format!(
      "SELECT id, operation_type, entity_type, entity_id, document_id, payload_json, logical_clock, status
       FROM sync_operations
       WHERE status IN ({placeholders})
       ORDER BY logical_clock ASC, created_at_ms ASC, id ASC"
    );
        let mut statement = self.connection.prepare(&query)?;
        let operations = statement
            .query_map(rusqlite::params_from_iter(statuses.iter()), |row| {
                let payload_raw = row.get::<_, String>(5)?;
                Ok(SyncOperationRow {
                    id: row.get(0)?,
                    operation_type: SyncOperationType::try_from_str(&row.get::<_, String>(1)?)
                        .map_err(|error| {
                            rusqlite::Error::ToSqlConversionFailure(Box::new(error))
                        })?,
                    entity_type: SyncEntityType::try_from_str(&row.get::<_, String>(2)?).map_err(
                        |error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)),
                    )?,
                    entity_id: row.get(3)?,
                    document_id: row.get(4)?,
                    payload_json: serde_json::from_str(&payload_raw).map_err(|error| {
                        rusqlite::Error::ToSqlConversionFailure(Box::new(error))
                    })?,
                    logical_clock: row.get(6)?,
                    status: SyncOperationStatus::try_from_str(&row.get::<_, String>(7)?).map_err(
                        |error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)),
                    )?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        drop(statement);
        Ok(operations)
    }

    fn preview_coalesced_intent_count(&self) -> Result<usize, AppError> {
        Ok(self
            .build_coalesced_sync_plan_from_operations(
                self.list_sync_operations_for_debug()?,
                false,
            )?
            .coalesced_intent_count)
    }

    fn coalesce_sync_operations(
        &self,
        operations: Vec<SyncOperationRow>,
    ) -> Result<CoalescedSyncPlan, AppError> {
        let mut plan = CoalescedSyncPlan::default();

        for operation in operations {
            let document_id =
                operation
                    .document_id
                    .clone()
                    .or_else(|| match operation.entity_type {
                        SyncEntityType::Document | SyncEntityType::DocumentTombstone => {
                            Some(operation.entity_id.clone())
                        }
                        _ => None,
                    });

            match operation.operation_type {
                SyncOperationType::DocumentDeleted => {
                    let doc_id = document_id.unwrap_or_else(|| operation.entity_id.clone());
                    plan.document_upserts.remove(&doc_id);
                    plan.document_ordering_upserts.remove(&doc_id);
                    plan.document_deletes.insert(doc_id, operation);
                }
                SyncOperationType::DocumentCreated
                | SyncOperationType::DocumentTouched
                | SyncOperationType::DocumentRenamed
                | SyncOperationType::DocumentStyleUpdated
                | SyncOperationType::DocumentRestored => {
                    let doc_id = document_id.unwrap_or_else(|| operation.entity_id.clone());
                    plan.document_deletes.remove(&doc_id);
                    plan.document_upserts.insert(doc_id, operation);
                }
                SyncOperationType::DocumentOrderingUpdated | SyncOperationType::BlockMoved => {
                    let Some(doc_id) = document_id else {
                        continue;
                    };
                    if plan.document_deletes.contains_key(&doc_id) {
                        continue;
                    }
                    plan.document_ordering_upserts.insert(doc_id, operation);
                }
                SyncOperationType::BlockDeleted => {
                    let block_id = operation.entity_id.clone();
                    plan.block_upserts.remove(&block_id);
                    plan.block_deletes.insert(block_id, operation);
                }
                SyncOperationType::BlockCreated
                | SyncOperationType::BlockContentUpdated
                | SyncOperationType::BlockKindChanged => {
                    let block_id = operation.entity_id.clone();
                    plan.block_deletes.remove(&block_id);
                    plan.block_upserts.insert(block_id, operation);
                }
            }
        }

        Ok(plan)
    }

    fn build_coalesced_sync_plan(&mut self) -> Result<BuiltApplyOperations, AppError> {
        self.build_coalesced_sync_plan_from_operations(self.list_sync_operations()?, true)
    }

    fn build_coalesced_sync_plan_from_operations(
        &self,
        operations: Vec<SyncOperationRow>,
        mark_processing: bool,
    ) -> Result<BuiltApplyOperations, AppError> {
        let plan = self.coalesce_sync_operations(operations)?;
        let mut save_documents = Vec::new();
        let mut save_blocks = Vec::new();
        let mut save_document_tombstones = Vec::new();
        let mut save_block_tombstones = Vec::new();
        let mut delete_record_names = Vec::new();
        let mut record_names_by_operation_id: HashMap<i64, HashSet<String>> = HashMap::new();
        let mut operation_contexts: HashMap<i64, BuiltOperationContext> = HashMap::new();
        let mut document_projection_versions: HashMap<String, i64> = HashMap::new();
        let mut projected_block_ids = HashSet::new();

        for (document_id, operation) in &plan.document_deletes {
            let document_record_name = SyncEntityType::Document.record_name(document_id);
            let document_tombstone_record_name =
                SyncEntityType::DocumentTombstone.record_name(document_id);
            operation_contexts.insert(
                operation.id,
                BuiltOperationContext {
                    document_id: Some(document_id.clone()),
                    clears_document_sync_state: true,
                },
            );
            if let Some(tombstone) =
                self.read_tombstone(SyncEntityType::DocumentTombstone, document_id)?
            {
                save_document_tombstones.push(BridgeDocumentTombstoneRecord {
                    document_id: tombstone.entity_id,
                    deleted_at_ms: tombstone.deleted_at_ms,
                    deleted_by_device_id: tombstone.deleted_by_device_id,
                });
                delete_record_names.push(document_record_name.clone());
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &document_tombstone_record_name,
                    operation.id,
                );
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &document_record_name,
                    operation.id,
                );
            }
        }

        for (document_id, operation) in &plan.document_upserts {
            if plan.document_deletes.contains_key(document_id) {
                continue;
            }
            let document_record_name = SyncEntityType::Document.record_name(document_id);
            let document_tombstone_record_name =
                SyncEntityType::DocumentTombstone.record_name(document_id);
            if let Some(document) = self.get_document(document_id)? {
                if document.deleted_at.is_none() {
                    document_projection_versions
                        .entry(document_id.clone())
                        .or_insert(document.updated_at);
                    operation_contexts.insert(
                        operation.id,
                        BuiltOperationContext {
                            document_id: Some(document_id.clone()),
                            clears_document_sync_state: false,
                        },
                    );
                    save_documents.push(self.document_record(document)?);
                    delete_record_names.push(document_tombstone_record_name.clone());
                    Self::push_record_operation_mapping(
                        &mut record_names_by_operation_id,
                        &document_record_name,
                        operation.id,
                    );
                    Self::push_record_operation_mapping(
                        &mut record_names_by_operation_id,
                        &document_tombstone_record_name,
                        operation.id,
                    );
                }
            }
        }

        for (document_id, operation) in &plan.document_ordering_upserts {
            if plan.document_deletes.contains_key(document_id) {
                continue;
            }
            let blocks = self.list_blocks(document_id)?;
            if blocks.is_empty() {
                continue;
            }
            if let Some(document) = self.get_document(document_id)? {
                if document.deleted_at.is_none() {
                    document_projection_versions
                        .entry(document_id.clone())
                        .or_insert(document.updated_at);
                }
            }
            operation_contexts.insert(
                operation.id,
                BuiltOperationContext {
                    document_id: Some(document_id.clone()),
                    clears_document_sync_state: false,
                },
            );
            for block in blocks {
                if projected_block_ids.insert(block.id.clone()) {
                    let block_record_name = SyncEntityType::Block.record_name(&block.id);
                    let block_tombstone_record_name =
                        SyncEntityType::BlockTombstone.record_name(&block.id);
                    save_blocks.push(self.block_record(block)?);
                    delete_record_names.push(block_tombstone_record_name.clone());
                    Self::push_record_operation_mapping(
                        &mut record_names_by_operation_id,
                        &block_record_name,
                        operation.id,
                    );
                    Self::push_record_operation_mapping(
                        &mut record_names_by_operation_id,
                        &block_tombstone_record_name,
                        operation.id,
                    );
                }
            }
        }

        for (block_id, operation) in &plan.block_deletes {
            if operation
                .document_id
                .as_ref()
                .is_some_and(|document_id| plan.document_deletes.contains_key(document_id))
            {
                continue;
            }
            if let Some(document_id) = &operation.document_id {
                if let Some(document) = self.get_document(document_id)? {
                    if document.deleted_at.is_none() {
                        document_projection_versions
                            .entry(document_id.clone())
                            .or_insert(document.updated_at);
                    }
                }
            }
            operation_contexts.insert(
                operation.id,
                BuiltOperationContext {
                    document_id: operation.document_id.clone(),
                    clears_document_sync_state: false,
                },
            );
            let block_record_name = SyncEntityType::Block.record_name(block_id);
            let block_tombstone_record_name = SyncEntityType::BlockTombstone.record_name(block_id);
            if let Some(tombstone) =
                self.read_tombstone(SyncEntityType::BlockTombstone, block_id)?
            {
                save_block_tombstones.push(BridgeBlockTombstoneRecord {
                    block_id: tombstone.entity_id,
                    document_id: tombstone.parent_document_id.unwrap_or_default(),
                    deleted_at_ms: tombstone.deleted_at_ms,
                    deleted_by_device_id: tombstone.deleted_by_device_id,
                });
                delete_record_names.push(block_record_name.clone());
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_tombstone_record_name,
                    operation.id,
                );
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_record_name,
                    operation.id,
                );
            }
        }

        for (block_id, operation) in &plan.block_upserts {
            if operation
                .document_id
                .as_ref()
                .is_some_and(|document_id| plan.document_deletes.contains_key(document_id))
            {
                continue;
            }
            if let Some(document_id) = &operation.document_id {
                if let Some(document) = self.get_document(document_id)? {
                    if document.deleted_at.is_none() {
                        document_projection_versions
                            .entry(document_id.clone())
                            .or_insert(document.updated_at);
                    }
                }
            }
            operation_contexts.insert(
                operation.id,
                BuiltOperationContext {
                    document_id: operation.document_id.clone(),
                    clears_document_sync_state: false,
                },
            );
            if projected_block_ids.contains(block_id) {
                let block_record_name = SyncEntityType::Block.record_name(block_id);
                let block_tombstone_record_name =
                    SyncEntityType::BlockTombstone.record_name(block_id);
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_record_name,
                    operation.id,
                );
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_tombstone_record_name,
                    operation.id,
                );
                continue;
            }

            if let Ok(block) = self.fetch_block(block_id) {
                let block_record_name = SyncEntityType::Block.record_name(block_id);
                let block_tombstone_record_name =
                    SyncEntityType::BlockTombstone.record_name(block_id);
                save_blocks.push(self.block_record(block)?);
                delete_record_names.push(block_tombstone_record_name.clone());
                projected_block_ids.insert(block_id.clone());
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_record_name,
                    operation.id,
                );
                Self::push_record_operation_mapping(
                    &mut record_names_by_operation_id,
                    &block_tombstone_record_name,
                    operation.id,
                );
            }
        }

        if mark_processing {
            let processing_ids = record_names_by_operation_id
                .keys()
                .copied()
                .collect::<Vec<_>>();
            for operation_id in processing_ids {
                self.connection.execute(
                    "UPDATE sync_operations
           SET status = ?1,
               last_error_code = NULL
           WHERE id = ?2",
                    params![SyncOperationStatus::Processing.as_str(), operation_id],
                )?;
            }
        }

        delete_record_names.sort();
        delete_record_names.dedup();
        let coalesced_intent_count = record_names_by_operation_id.len();

        Ok(BuiltApplyOperations {
            request: ApplyOperationsRequest {
                zone_name: ICLOUD_ZONE_NAME.to_string(),
                save_documents,
                save_blocks,
                save_document_tombstones,
                save_block_tombstones,
                delete_record_names,
            },
            record_names_by_operation_id,
            operation_contexts,
            document_projection_versions,
            coalesced_intent_count,
        })
    }

    fn process_apply_response(
        &self,
        built: &BuiltApplyOperations,
        response: &ApplyOperationsResponse,
    ) -> Result<ApplyResponseStats, AppError> {
        struct DocumentApplyState {
            all_succeeded: bool,
            clears_sync_state: bool,
        }

        let saved_record_names = response
            .saved_record_names
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        let failed_by_record_name = response
            .failed
            .iter()
            .map(|failure| (failure.record_name.clone(), failure.error_code.clone()))
            .collect::<HashMap<_, _>>();
        let mut document_apply_states: HashMap<String, DocumentApplyState> = HashMap::new();

        let mut failed_count = 0;
        for (operation_id, record_names) in &built.record_names_by_operation_id {
            let mut operation_failure_code = None::<String>;
            let mut missing_result = false;

            for record_name in record_names {
                if saved_record_names.contains(record_name) {
                    continue;
                }
                if let Some(error_code) = failed_by_record_name.get(record_name) {
                    operation_failure_code = Some(error_code.clone());
                    break;
                }
                missing_result = true;
            }

            if let Some(context) = built.operation_contexts.get(operation_id) {
                if let Some(document_id) = &context.document_id {
                    let entry =
                        document_apply_states
                            .entry(document_id.clone())
                            .or_insert(DocumentApplyState {
                                all_succeeded: true,
                                clears_sync_state: false,
                            });
                    entry.clears_sync_state |= context.clears_document_sync_state;
                }
            }

            if let Some(error_code) = operation_failure_code {
                failed_count += 1;
                if let Some(context) = built.operation_contexts.get(operation_id) {
                    if let Some(document_id) = &context.document_id {
                        document_apply_states
                            .entry(document_id.clone())
                            .or_insert(DocumentApplyState {
                                all_succeeded: true,
                                clears_sync_state: false,
                            })
                            .all_succeeded = false;
                    }
                }
                self.connection.execute(
                    "UPDATE sync_operations
           SET attempt_count = attempt_count + 1,
               last_error_code = ?1,
               status = ?2
           WHERE id = ?3",
                    params![
                        error_code,
                        SyncOperationStatus::Failed.as_str(),
                        operation_id,
                    ],
                )?;
                continue;
            }

            if missing_result {
                failed_count += 1;
                if let Some(context) = built.operation_contexts.get(operation_id) {
                    if let Some(document_id) = &context.document_id {
                        document_apply_states
                            .entry(document_id.clone())
                            .or_insert(DocumentApplyState {
                                all_succeeded: true,
                                clears_sync_state: false,
                            })
                            .all_succeeded = false;
                    }
                }
                self.connection.execute(
                    "UPDATE sync_operations
           SET attempt_count = attempt_count + 1,
               last_error_code = ?1,
               status = ?2
           WHERE id = ?3
             AND status = ?4",
                    params![
                        "apply_missing_result",
                        SyncOperationStatus::Failed.as_str(),
                        operation_id,
                        SyncOperationStatus::Processing.as_str(),
                    ],
                )?;
                continue;
            }

            self.connection.execute(
                "DELETE FROM sync_operations WHERE id = ?1",
                params![operation_id],
            )?;
        }

        let now = Self::now();
        for (document_id, state) in document_apply_states {
            if !state.all_succeeded {
                continue;
            }

            if state.clears_sync_state {
                self.clear_document_sync_state(&document_id)?;
                continue;
            }

            let Some(projected_updated_at_ms) =
                built.document_projection_versions.get(&document_id).copied()
            else {
                continue;
            };
            self.upsert_document_sync_state(&document_id, projected_updated_at_ms, now)?;
        }

        Ok(ApplyResponseStats { failed_count })
    }

    fn push_record_operation_mapping(
        record_names_by_operation_id: &mut HashMap<i64, HashSet<String>>,
        record_name: &str,
        operation_id: i64,
    ) {
        record_names_by_operation_id
            .entry(operation_id)
            .or_default()
            .insert(record_name.to_string());
    }

    fn document_record(&self, document: Document) -> Result<BridgeDocumentRecord, AppError> {
        Ok(BridgeDocumentRecord {
            document_id: document.id,
            title: document.title.unwrap_or_default(),
            block_tint_override: document
                .block_tint_override
                .map(|value| value.as_str().to_string()),
            document_surface_tone_override: document
                .document_surface_tone_override
                .map(|value| value.as_str().to_string()),
            updated_at_ms: document.updated_at,
            updated_by_device_id: document
                .updated_by_device_id
                .unwrap_or(self.current_device_id()?),
        })
    }

    fn block_record(&self, block: Block) -> Result<BridgeBlockRecord, AppError> {
        Ok(BridgeBlockRecord {
            block_id: block.id,
            document_id: block.document_id,
            kind: block.kind.as_str().to_string(),
            content: block.content,
            language: block.language,
            position: block.position,
            updated_at_ms: block.updated_at,
            updated_by_device_id: block
                .updated_by_device_id
                .unwrap_or(self.current_device_id()?),
        })
    }

    fn apply_remote_changes(&mut self, changes: &FetchChangesResponse) -> Result<(), AppError> {
        let mut affected_documents = HashSet::new();
        let mut next_temp_position = 1_000_000_000_i64;

        for document in &changes.documents {
            if self.apply_remote_document(document)? {
                affected_documents.insert(document.document_id.clone());
            }
        }

        for tombstone in &changes.document_tombstones {
            if self.apply_remote_document_tombstone(tombstone)? {
                affected_documents.insert(tombstone.document_id.clone());
            }
        }

        for block in &changes.blocks {
            if self.apply_remote_block(block, &mut next_temp_position)? {
                affected_documents.insert(block.document_id.clone());
            }
        }

        for tombstone in &changes.block_tombstones {
            if self.apply_remote_block_tombstone(tombstone)? {
                affected_documents.insert(tombstone.document_id.clone());
            }
        }

        for document_id in affected_documents {
            self.rebuild_search_index(&document_id)?;
            if self.normalize_positions_if_needed(&document_id)? {
                self.record_document_touch(&document_id)?;
                self.record_document_ordering_updated(&document_id)?;
                continue;
            }

            if let Some(document) = self.get_document(&document_id)? {
                if document.deleted_at.is_none() {
                    self.upsert_document_sync_state(&document_id, document.updated_at, Self::now())?;
                } else {
                    self.clear_document_sync_state(&document_id)?;
                }
            } else {
                self.clear_document_sync_state(&document_id)?;
            }
        }

        Ok(())
    }

    fn apply_remote_document(&mut self, remote: &BridgeDocumentRecord) -> Result<bool, AppError> {
        let local = self.get_document(&remote.document_id)?;
        let tombstone =
            self.read_tombstone(SyncEntityType::DocumentTombstone, &remote.document_id)?;

        if let Some(tombstone) = tombstone {
            if compare_logical_clock(
                remote.updated_at_ms,
                &remote.updated_by_device_id,
                tombstone.deleted_at_ms,
                &tombstone.deleted_by_device_id,
            ) <= 0
            {
                self.record_document_deletion(&remote.document_id, tombstone.deleted_at_ms)?;
                return Ok(false);
            }
        }

        if let Some(local) = &local {
            if compare_logical_clock(
                local.updated_at,
                local.updated_by_device_id.as_deref().unwrap_or(""),
                remote.updated_at_ms,
                &remote.updated_by_device_id,
            ) > 0
            {
                self.enqueue_document_projection_operations(&remote.document_id)?;
                return Ok(false);
            }
        }

        if local.is_some() {
            self.connection.execute(
                "UPDATE documents
         SET title = ?1,
             block_tint_override = ?2,
             document_surface_tone_override = ?3,
             updated_at = ?4,
             updated_by_device_id = ?5,
             deleted_at = NULL
         WHERE id = ?6",
                params![
                    if remote.title.trim().is_empty() {
                        None::<String>
                    } else {
                        Some(remote.title.clone())
                    },
                    remote.block_tint_override,
                    remote.document_surface_tone_override,
                    remote.updated_at_ms,
                    remote.updated_by_device_id,
                    remote.document_id,
                ],
            )?;
        } else {
            self.connection.execute(
                "INSERT INTO documents (
           id,
           title,
           block_tint_override,
           document_surface_tone_override,
           created_at,
           updated_at,
           updated_by_device_id,
           last_opened_at,
           deleted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)",
                params![
                    remote.document_id,
                    if remote.title.trim().is_empty() {
                        None::<String>
                    } else {
                        Some(remote.title.clone())
                    },
                    remote.block_tint_override,
                    remote.document_surface_tone_override,
                    remote.updated_at_ms,
                    remote.updated_at_ms,
                    remote.updated_by_device_id,
                    remote.updated_at_ms,
                ],
            )?;
        }

        self.connection.execute(
            "DELETE FROM sync_tombstones WHERE entity_type = ?1 AND entity_id = ?2",
            params![
                SyncEntityType::DocumentTombstone.as_str(),
                remote.document_id
            ],
        )?;
        self.discard_pending_operations(SyncEntityType::Document, &remote.document_id)?;
        self.discard_pending_operations(SyncEntityType::DocumentTombstone, &remote.document_id)?;
        Ok(true)
    }

    fn apply_remote_document_tombstone(
        &mut self,
        remote: &BridgeDocumentTombstoneRecord,
    ) -> Result<bool, AppError> {
        let local = self.get_document(&remote.document_id)?;
        let local_deleted_at = local
            .as_ref()
            .and_then(|document| document.deleted_at)
            .unwrap_or(i64::MIN);
        let local_deleted_by_device_id = self
            .read_tombstone(SyncEntityType::DocumentTombstone, &remote.document_id)?
            .map(|row| row.deleted_by_device_id)
            .unwrap_or_default();

        if let Some(local) = &local {
            if compare_logical_clock(
                local.updated_at,
                local.updated_by_device_id.as_deref().unwrap_or(""),
                remote.deleted_at_ms,
                &remote.deleted_by_device_id,
            ) > 0
            {
                self.enqueue_document_projection_operations(&remote.document_id)?;
                return Ok(false);
            }
        }

        if compare_logical_clock(
            local_deleted_at,
            &local_deleted_by_device_id,
            remote.deleted_at_ms,
            &remote.deleted_by_device_id,
        ) > 0
        {
            self.record_document_deletion(&remote.document_id, local_deleted_at)?;
            return Ok(false);
        }

        self.upsert_tombstone(
            SyncEntityType::DocumentTombstone,
            &remote.document_id,
            None,
            remote.deleted_at_ms,
            &remote.deleted_by_device_id,
        )?;

        if local.is_some() {
            self.connection.execute(
                "UPDATE documents
         SET deleted_at = ?1,
             updated_at = ?1,
             updated_by_device_id = ?2
         WHERE id = ?3",
                params![
                    remote.deleted_at_ms,
                    remote.deleted_by_device_id,
                    remote.document_id
                ],
            )?;
            self.discard_pending_operations(SyncEntityType::Document, &remote.document_id)?;
            self.discard_pending_operations(
                SyncEntityType::DocumentTombstone,
                &remote.document_id,
            )?;
            return Ok(true);
        }

        Ok(false)
    }

    fn apply_remote_block(
        &mut self,
        remote: &BridgeBlockRecord,
        next_temp_position: &mut i64,
    ) -> Result<bool, AppError> {
        self.ensure_document_placeholder(
            &remote.document_id,
            remote.updated_at_ms,
            &remote.updated_by_device_id,
        )?;
        let local = self.fetch_block(&remote.block_id).ok();
        let tombstone = self.read_tombstone(SyncEntityType::BlockTombstone, &remote.block_id)?;

        if let Some(tombstone) = tombstone {
            if compare_logical_clock(
                remote.updated_at_ms,
                &remote.updated_by_device_id,
                tombstone.deleted_at_ms,
                &tombstone.deleted_by_device_id,
            ) <= 0
            {
                self.record_block_deletion(
                    &remote.block_id,
                    &remote.document_id,
                    tombstone.deleted_at_ms,
                )?;
                return Ok(false);
            }
        }

        if let Some(local) = &local {
            if compare_logical_clock(
                local.updated_at,
                local.updated_by_device_id.as_deref().unwrap_or(""),
                remote.updated_at_ms,
                &remote.updated_by_device_id,
            ) > 0
            {
                self.enqueue_document_projection_operations(&remote.document_id)?;
                return Ok(false);
            }
        }

        let kind = BlockKind::try_from_str(&remote.kind)?;
        let search_text = match kind {
            BlockKind::Markdown => {
                let (_, search_text, _) = Self::normalize_markdown_storage(&remote.content);
                search_text
            }
            BlockKind::Code | BlockKind::Text => remote.content.clone(),
        };

        self.displace_conflicting_block_positions(
            &remote.document_id,
            remote.position,
            &remote.block_id,
            next_temp_position,
        )?;

        if local.is_some() {
            self.connection.execute(
                "UPDATE blocks
         SET document_id = ?1,
             kind = ?2,
             position = ?3,
             content = ?4,
             search_text = ?5,
             language = ?6,
             updated_at = ?7,
             updated_by_device_id = ?8
         WHERE id = ?9",
                params![
                    remote.document_id,
                    remote.kind,
                    remote.position,
                    remote.content,
                    search_text,
                    remote.language,
                    remote.updated_at_ms,
                    remote.updated_by_device_id,
                    remote.block_id,
                ],
            )?;
        } else {
            self.connection.execute(
                "INSERT INTO blocks (
           id,
           document_id,
           kind,
           position,
           content,
           search_text,
           language,
           created_at,
           updated_at,
           updated_by_device_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    remote.block_id,
                    remote.document_id,
                    remote.kind,
                    remote.position,
                    remote.content,
                    search_text,
                    remote.language,
                    remote.updated_at_ms,
                    remote.updated_at_ms,
                    remote.updated_by_device_id,
                ],
            )?;
        }

        self.connection.execute(
            "DELETE FROM sync_tombstones WHERE entity_type = ?1 AND entity_id = ?2",
            params![SyncEntityType::BlockTombstone.as_str(), remote.block_id],
        )?;
        self.discard_pending_operations(SyncEntityType::Block, &remote.block_id)?;
        self.discard_pending_operations(SyncEntityType::BlockTombstone, &remote.block_id)?;
        Ok(true)
    }

    fn displace_conflicting_block_positions(
        &self,
        document_id: &str,
        target_position: i64,
        keep_block_id: &str,
        next_temp_position: &mut i64,
    ) -> Result<(), AppError> {
        let conflicting_ids = self
            .connection
            .prepare(
                "SELECT id
         FROM blocks
         WHERE document_id = ?1
           AND position = ?2
           AND id != ?3
         ORDER BY id ASC",
            )?
            .query_map(
                params![document_id, target_position, keep_block_id],
                |row| row.get::<_, String>(0),
            )?
            .collect::<Result<Vec<_>, _>>()?;

        for block_id in conflicting_ids {
            self.connection.execute(
                "UPDATE blocks SET position = ?1 WHERE id = ?2",
                params![*next_temp_position, block_id],
            )?;
            *next_temp_position += 1;
        }

        Ok(())
    }

    fn apply_remote_block_tombstone(
        &mut self,
        remote: &BridgeBlockTombstoneRecord,
    ) -> Result<bool, AppError> {
        let local = self.fetch_block(&remote.block_id).ok();
        let local_tombstone =
            self.read_tombstone(SyncEntityType::BlockTombstone, &remote.block_id)?;

        if let Some(local) = &local {
            if compare_logical_clock(
                local.updated_at,
                local.updated_by_device_id.as_deref().unwrap_or(""),
                remote.deleted_at_ms,
                &remote.deleted_by_device_id,
            ) > 0
            {
                self.enqueue_document_projection_operations(&remote.document_id)?;
                return Ok(false);
            }
        }

        if let Some(local_tombstone) = local_tombstone {
            if compare_logical_clock(
                local_tombstone.deleted_at_ms,
                &local_tombstone.deleted_by_device_id,
                remote.deleted_at_ms,
                &remote.deleted_by_device_id,
            ) > 0
            {
                self.record_block_deletion(
                    &remote.block_id,
                    &remote.document_id,
                    local_tombstone.deleted_at_ms,
                )?;
                return Ok(false);
            }
        }

        self.upsert_tombstone(
            SyncEntityType::BlockTombstone,
            &remote.block_id,
            Some(&remote.document_id),
            remote.deleted_at_ms,
            &remote.deleted_by_device_id,
        )?;

        if local.is_some() {
            self.connection
                .execute("DELETE FROM blocks WHERE id = ?1", params![remote.block_id])?;
            self.ensure_document_has_block(&remote.document_id)?;
            self.discard_pending_operations(SyncEntityType::Block, &remote.block_id)?;
            self.discard_pending_operations(SyncEntityType::BlockTombstone, &remote.block_id)?;
            return Ok(true);
        }

        Ok(false)
    }

    fn ensure_document_placeholder(
        &self,
        document_id: &str,
        updated_at_ms: i64,
        updated_by_device_id: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO documents (
         id,
         title,
         block_tint_override,
         document_surface_tone_override,
         created_at,
         updated_at,
         updated_by_device_id,
         last_opened_at,
         deleted_at
       ) VALUES (?1, NULL, NULL, NULL, ?2, ?2, ?3, ?2, NULL)
       ON CONFLICT(id) DO NOTHING",
            params![document_id, updated_at_ms, updated_by_device_id],
        )?;
        Ok(())
    }

    fn ensure_document_has_block(&mut self, document_id: &str) -> Result<(), AppError> {
        let deleted_at = self
            .get_document(document_id)?
            .and_then(|document| document.deleted_at);
        if deleted_at.is_some() {
            return Ok(());
        }

        let remaining = self.connection.query_row(
            "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
            params![document_id],
            |row| row.get::<_, i64>(0),
        )?;

        if remaining == 0 {
            let block = self.create_empty_block(document_id, 0, BlockKind::Markdown)?;
            self.connection.execute(
                "UPDATE blocks SET updated_by_device_id = ?1 WHERE id = ?2",
                params![self.current_device_id()?, block.id],
            )?;
            self.enqueue_document_projection_operations(document_id)?;
        }

        Ok(())
    }

    fn normalize_positions_if_needed(&mut self, document_id: &str) -> Result<bool, AppError> {
        let rows = self
            .connection
            .prepare(
                "SELECT id, position
         FROM blocks
         WHERE document_id = ?1
         ORDER BY position ASC, updated_at ASC, id ASC",
            )?
            .query_map(params![document_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        if rows.is_empty() {
            return Ok(false);
        }

        let already_normalized = rows
            .iter()
            .enumerate()
            .all(|(index, (_, position))| *position == index as i64);
        if already_normalized {
            return Ok(false);
        }

        let device_id = self.current_device_id()?;
        let now = Self::now();
        let transaction = self.connection.transaction()?;
        let ordered_ids = rows.into_iter().map(|(id, _)| id).collect::<Vec<_>>();
        Self::rewrite_positions(&transaction, document_id, &ordered_ids)?;
        for block_id in &ordered_ids {
            transaction.execute(
                "UPDATE blocks
         SET updated_at = ?1,
             updated_by_device_id = ?2
         WHERE id = ?3",
                params![now, device_id, block_id],
            )?;
        }
        transaction.execute(
            "UPDATE documents
       SET updated_at = ?1,
           updated_by_device_id = ?2
       WHERE id = ?3",
            params![now, device_id, document_id],
        )?;
        transaction.commit()?;
        Ok(true)
    }
}

fn compare_logical_clock(
    left_timestamp: i64,
    left_device_id: &str,
    right_timestamp: i64,
    right_device_id: &str,
) -> i8 {
    match left_timestamp.cmp(&right_timestamp) {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Greater => 1,
        std::cmp::Ordering::Equal => match left_device_id.cmp(right_device_id) {
            std::cmp::Ordering::Less => -1,
            std::cmp::Ordering::Greater => 1,
            std::cmp::Ordering::Equal => 0,
        },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SyncErrorCategory {
    Offline,
    Network,
    Server,
    Account,
    Validation,
}

impl SyncErrorCategory {
    fn as_code(self) -> &'static str {
        match self {
            Self::Offline => "offline",
            Self::Network => "network",
            Self::Server => "server",
            Self::Account => "account",
            Self::Validation => "validation",
        }
    }
}

fn classify_sync_error(error: &AppError) -> (SyncErrorCategory, String) {
    match error {
        AppError::Validation(message) if is_offline_error_message(message) => (
            SyncErrorCategory::Offline,
            "오프라인 상태입니다. 인터넷 연결을 확인하면 자동으로 다시 시도합니다.".to_string(),
        ),
        AppError::Validation(message) if is_connectivity_error_message(message) => (
            SyncErrorCategory::Network,
            "네트워크 연결이 불안정합니다. 잠시 후 자동으로 다시 시도합니다.".to_string(),
        ),
        AppError::Validation(message) if message.contains("Zone does not exist") => (
            SyncErrorCategory::Server,
            "iCloud 동기화 영역을 아직 준비하는 중입니다. 잠시 후 자동으로 다시 시도합니다."
                .to_string(),
        ),
        AppError::Validation(message)
            if message.contains("no_account") || message.contains("restricted") =>
        {
            (SyncErrorCategory::Account, message.clone())
        }
        AppError::Validation(message) => (SyncErrorCategory::Validation, message.clone()),
        _ => (SyncErrorCategory::Server, error.to_string()),
    }
}

fn is_connectivity_error_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "nsurlerrordomain:-1005",
        "nsurlerrordomain:-1001",
        "network connection was lost",
        "network unavailable",
        "could not connect to the server",
        "connection was lost",
        "timed out",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

fn is_offline_error_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "nsurlerrordomain:-1009",
        "not connected to the internet",
        "internet connection appears to be offline",
        "network is offline",
        "offline",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

pub(crate) fn is_retryable_sync_error(error: &AppError) -> bool {
    matches!(
        classify_sync_error(error).0,
        SyncErrorCategory::Offline | SyncErrorCategory::Network | SyncErrorCategory::Server
    )
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::infrastructure::cloudkit_bridge::ServerChangedRecords;
    use crate::ports::repositories::BlockRepository;
    use crate::ports::repositories::DocumentRepository;

    fn test_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("minnote-sync-test-{}.db", uuid::Uuid::new_v4()))
    }

    fn test_store() -> SqliteStore {
        SqliteStore::new(&test_db_path()).expect("test store should be created")
    }

    #[test]
    fn sync_status_defaults_to_disabled() {
        let store = test_store();

        let status = store
            .get_icloud_sync_status()
            .expect("sync status should load");

        assert!(!status.enabled);
        assert_eq!(status.state, ICloudSyncState::Disabled);
        assert_eq!(status.account_status, ICloudAccountStatus::Unknown);
    }

    #[test]
    fn enabling_sync_persists_status() {
        let mut store = test_store();

        let status = store
            .set_icloud_sync_enabled(true)
            .expect("sync should enable");

        assert!(status.enabled);
        assert_eq!(status.state, ICloudSyncState::Idle);
    }

    #[test]
    fn deleting_document_queues_tombstone_and_source_delete() {
        let mut store = test_store();
        let document = store
            .create_document(Some("sync 문서".to_string()))
            .expect("document should be created");

        store
            .delete_document(&document.id)
            .expect("document should be queued for deletion");

        let tombstone = store
            .read_tombstone(SyncEntityType::DocumentTombstone, &document.id)
            .expect("tombstone should load");
        let operations = store
            .list_sync_operations()
            .expect("operations should load");

        assert!(tombstone.is_some());
        assert!(operations.iter().any(|entry| {
            entry.entity_type == SyncEntityType::DocumentTombstone
                && entry.entity_id == document.id
                && entry.operation_type == SyncOperationType::DocumentDeleted
        }));
        assert!(operations.iter().any(|entry| {
            entry.entity_type == SyncEntityType::BlockTombstone
                && entry.document_id.as_deref() == Some(document.id.as_str())
        }));
    }

    #[test]
    fn sync_completion_keeps_pending_state_when_operations_remain() {
        let mut store = test_store();
        let document = store
            .create_document(Some("pending 문서".to_string()))
            .expect("document should be created");
        store
            .set_icloud_sync_enabled(true)
            .expect("sync should enable");

        let result = store.ensure_sync_completion_succeeded(ApplyResponseStats { failed_count: 0 });

        assert!(result.is_ok());

        let status = store
            .get_icloud_sync_status()
            .expect("sync status should load");
        assert_eq!(status.state, ICloudSyncState::Pending);
        assert_eq!(status.last_error_code, None);
        assert_eq!(status.pending_operation_count, 3);

        let operations = store
            .list_sync_operations()
            .expect("operations should load");
        assert!(operations
            .iter()
            .any(|entry| entry.entity_id == document.id));
    }

    #[test]
    fn sync_completion_fails_when_apply_response_has_failures() {
        let mut store = test_store();
        store
            .set_icloud_sync_enabled(true)
            .expect("sync should enable");

        let result = store.ensure_sync_completion_succeeded(ApplyResponseStats { failed_count: 2 });

        assert!(result.is_err());

        let status = store
            .get_icloud_sync_status()
            .expect("sync status should load");
        assert_eq!(status.state, ICloudSyncState::Error);
        assert_eq!(
            status.last_error_code.as_deref(),
            Some("apply_partial_failure")
        );
        assert!(status
            .last_error_message
            .as_deref()
            .is_some_and(|message| message.contains("2건")));
    }

    #[test]
    fn applying_remote_block_reorder_avoids_position_uniqueness_conflicts() {
        let mut store = test_store();
        let document = store
            .create_document(Some("재정렬 테스트".to_string()))
            .expect("document should be created");
        let blocks = store
            .create_block_below(&document.id, None, BlockKind::Text)
            .expect("second block should be created");
        let blocks = store
            .create_block_below(&document.id, Some(&blocks[1].id), BlockKind::Code)
            .expect("third block should be created");

        let original = blocks;
        let reordered = vec![
            original[2].clone(),
            original[0].clone(),
            original[1].clone(),
        ];
        let remote_updated_at = SqliteStore::now() + 10_000;

        store
            .apply_remote_changes(&FetchChangesResponse {
                documents: vec![],
                blocks: reordered
                    .iter()
                    .enumerate()
                    .map(|(position, block)| BridgeBlockRecord {
                        block_id: block.id.clone(),
                        document_id: document.id.clone(),
                        kind: block.kind.as_str().to_string(),
                        content: block.content.clone(),
                        language: block.language.clone(),
                        position: position as i64,
                        updated_at_ms: remote_updated_at + position as i64,
                        updated_by_device_id: "remote-device".to_string(),
                    })
                    .collect(),
                document_tombstones: vec![],
                block_tombstones: vec![],
                next_server_change_token: None,
            })
            .expect("remote reorder should apply");

        let final_blocks = store.list_blocks(&document.id).expect("blocks should load");
        let final_ids = final_blocks
            .iter()
            .map(|block| block.id.as_str())
            .collect::<Vec<_>>();
        let final_positions = final_blocks
            .iter()
            .map(|block| block.position)
            .collect::<Vec<_>>();

        assert_eq!(
            final_ids,
            reordered
                .iter()
                .map(|block| block.id.as_str())
                .collect::<Vec<_>>()
        );
        assert_eq!(final_positions, vec![0, 1, 2]);
    }

    #[test]
    fn existing_local_documents_queue_even_when_server_token_exists() {
        let mut store = test_store();
        let first = store
            .create_document(Some("첫 문서".to_string()))
            .expect("first document should be created");
        let second = store
            .create_document(Some("둘째 문서".to_string()))
            .expect("second document should be created");

        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");
        store
            .connection
            .execute(
                "UPDATE cloudkit_state SET server_change_token = ?1 WHERE scope = ?2",
                params!["token-1", ICLOUD_SCOPE_PRIVATE],
            )
            .expect("server change token should update");

        let built = store
            .apply_remote_changes_and_build_operations(&FetchChangesResponse {
                documents: vec![],
                blocks: vec![],
                document_tombstones: vec![],
                block_tombstones: vec![],
                next_server_change_token: None,
            })
            .expect("existing local documents should queue");

        assert_eq!(built.request.save_documents.len(), 2);
        assert_eq!(built.request.save_blocks.len(), 2);

        let operations = store
            .list_sync_operations_for_debug()
            .expect("operations should load");
        assert!(operations.iter().any(|entry| entry.entity_id == first.id));
        assert!(operations.iter().any(|entry| entry.entity_id == second.id));
    }

    #[test]
    fn remote_documents_are_marked_synced_while_local_unsynced_documents_upload() {
        let mut store = test_store();
        let local = store
            .create_document(Some("로컬 문서".to_string()))
            .expect("local document should be created");

        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");

        let remote_updated_at = SqliteStore::now();
        let built = store
            .apply_remote_changes_and_build_operations(&FetchChangesResponse {
                documents: vec![BridgeDocumentRecord {
                    document_id: "remote-doc".to_string(),
                    title: "원격 문서".to_string(),
                    block_tint_override: None,
                    document_surface_tone_override: None,
                    updated_at_ms: remote_updated_at,
                    updated_by_device_id: "remote-device".to_string(),
                }],
                blocks: vec![],
                document_tombstones: vec![],
                block_tombstones: vec![],
                next_server_change_token: None,
            })
            .expect("remote existing state should still queue local documents");

        assert_eq!(
            built.request.save_documents.len(),
            1,
            "remote document should not be re-uploaded"
        );
        assert_eq!(built.request.save_documents[0].document_id, local.id);
        assert!(
            store
                .read_document_sync_state("remote-doc")
                .expect("remote document sync state should load")
                .is_some(),
            "remote document should be marked as already projected"
        );
    }

    #[test]
    fn successful_apply_marks_document_sync_state() {
        let mut store = test_store();
        let document = store
            .create_document(Some("업로드 상태".to_string()))
            .expect("document should be created");

        let built = store
            .build_coalesced_sync_plan()
            .expect("coalesced plan should build");
        let saved_record_names = built
            .record_names_by_operation_id
            .values()
            .flat_map(|record_names| record_names.iter().cloned())
            .collect::<Vec<_>>();

        store
            .process_apply_response(
                &built,
                &ApplyOperationsResponse {
                    saved_record_names,
                    failed: vec![],
                    server_changed: ServerChangedRecords::default(),
                },
            )
            .expect("apply response should succeed");

        let sync_state = store
            .read_document_sync_state(&document.id)
            .expect("document sync state should load")
            .expect("document sync state should exist");
        assert_eq!(
            sync_state.last_projected_updated_at_ms,
            Some(document.updated_at)
        );
        assert!(sync_state.last_uploaded_success_at_ms.is_some());
    }

    #[test]
    fn force_redownload_clears_document_sync_state() {
        let mut store = test_store();
        let document = store
            .create_document(Some("복구 테스트".to_string()))
            .expect("document should be created");

        store
            .upsert_document_sync_state(&document.id, document.updated_at, SqliteStore::now())
            .expect("document sync state should insert");

        store
            .force_redownload_from_cloud()
            .expect("force redownload should succeed");

        assert!(
            store
                .read_document_sync_state(&document.id)
                .expect("document sync state should load")
                .is_none()
        );
    }

    #[test]
    fn repeated_block_updates_collapse_to_single_block_projection() {
        let mut store = test_store();
        let document = store
            .create_document(Some("압축 테스트".to_string()))
            .expect("document should be created");
        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");

        let block_id = store
            .list_blocks(&document.id)
            .expect("blocks should load")
            .first()
            .expect("initial block should exist")
            .id
            .clone();

        store
            .update_markdown_block(&block_id, "첫 수정".to_string())
            .expect("first update should succeed");
        store
            .update_markdown_block(&block_id, "둘째 수정".to_string())
            .expect("second update should succeed");

        let built = store
            .build_coalesced_sync_plan()
            .expect("coalesced plan should build");

        assert_eq!(built.request.save_blocks.len(), 1);
        assert_eq!(built.request.save_blocks[0].block_id, block_id);
        assert_eq!(built.coalesced_intent_count(), 2);
    }

    #[test]
    fn repeated_reorder_collapses_to_single_document_ordering_intent() {
        let mut store = test_store();
        let document = store
            .create_document(Some("재정렬 압축".to_string()))
            .expect("document should be created");
        let blocks = store
            .create_block_below(&document.id, None, BlockKind::Text)
            .expect("second block should be created");
        let blocks = store
            .create_block_below(&document.id, Some(&blocks[1].id), BlockKind::Code)
            .expect("third block should be created");

        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");

        store
            .move_block(&document.id, &blocks[2].id, 0)
            .expect("first move should succeed");
        store
            .move_block(&document.id, &blocks[0].id, 2)
            .expect("second move should succeed");

        let operations = store
            .list_sync_operations()
            .expect("operations should load");
        assert_eq!(
            operations
                .iter()
                .filter(|entry| entry.operation_type == SyncOperationType::DocumentOrderingUpdated)
                .count(),
            1
        );

        let built = store
            .build_coalesced_sync_plan()
            .expect("coalesced plan should build");

        assert_eq!(built.request.save_blocks.len(), 3);
        assert_eq!(built.coalesced_intent_count(), 2);
    }

    #[test]
    fn document_delete_supersedes_block_intents_in_coalesced_plan() {
        let mut store = test_store();
        let document = store
            .create_document(Some("삭제 압축".to_string()))
            .expect("document should be created");
        let block_id = store
            .list_blocks(&document.id)
            .expect("blocks should load")
            .first()
            .expect("initial block should exist")
            .id
            .clone();

        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");

        store
            .update_markdown_block(&block_id, "수정".to_string())
            .expect("block update should succeed");
        store
            .delete_document(&document.id)
            .expect("document delete should succeed");

        let built = store
            .build_coalesced_sync_plan()
            .expect("coalesced plan should build");

        assert_eq!(built.request.save_documents.len(), 0);
        assert_eq!(built.request.save_blocks.len(), 0);
        assert_eq!(built.request.save_document_tombstones.len(), 1);
        assert_eq!(built.request.save_block_tombstones.len(), 0);
        assert_eq!(built.coalesced_intent_count(), 1);
    }

    #[test]
    fn legacy_block_moved_rows_expand_to_document_ordering_projection() {
        let mut store = test_store();
        let document = store
            .create_document(Some("legacy move".to_string()))
            .expect("document should be created");
        let blocks = store
            .create_block_below(&document.id, None, BlockKind::Text)
            .expect("second block should be created");

        store
            .connection
            .execute("DELETE FROM sync_operations", [])
            .expect("operations should clear");

        store
            .enqueue_sync_operation(
                SyncOperationType::BlockMoved,
                SyncEntityType::Block,
                &blocks[0].id,
                Some(&document.id),
                json!({ "targetPosition": 1 }),
                SqliteStore::now(),
            )
            .expect("legacy move operation should enqueue");

        let built = store
            .build_coalesced_sync_plan()
            .expect("coalesced plan should build");

        assert_eq!(built.request.save_blocks.len(), 2);
        assert_eq!(built.coalesced_intent_count(), 1);
    }

    #[test]
    fn cleanup_orphaned_legacy_tombstone_operations_removes_pending_rows() {
        let store = test_store();
        store
            .connection
            .execute(
                "INSERT INTO sync_operations (
                   operation_type,
                   entity_type,
                   entity_id,
                   document_id,
                   payload_json,
                   logical_clock,
                   created_at_ms,
                   attempt_count,
                   last_error_code,
                   status
                 ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5, 0, NULL, 'pending')",
                params![
                    SyncOperationType::BlockDeleted.as_str(),
                    SyncEntityType::BlockTombstone.as_str(),
                    "orphan-block-id",
                    json!({ "migratedFrom": "sync_outbox", "legacyOp": "upsert" }).to_string(),
                    SqliteStore::now(),
                ],
            )
            .expect("legacy orphan row should insert");

        store
            .cleanup_orphaned_sync_operations()
            .expect("orphan cleanup should succeed");

        let count = store
            .connection
            .query_row("SELECT COUNT(*) FROM sync_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("operation count should load");

        assert_eq!(count, 0);
    }
}
