use std::collections::{HashMap, HashSet};

use std::thread;
use std::time::Duration;

use rusqlite::{params, OptionalExtension};

use crate::domain::models::{
  Block,
  BlockKind,
  Document,
  ICloudAccountStatus,
  ICloudSyncState,
  ICloudSyncStatus,
};
use crate::error::AppError;
use crate::infrastructure::cloudkit_bridge::{
  ApplyOperationsRequest,
  ApplyOperationsResponse,
  BridgeBlockRecord,
  BridgeBlockTombstoneRecord,
  BridgeDocumentRecord,
  BridgeDocumentTombstoneRecord,
  CloudKitBridge,
  FetchChangesRequest,
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
      _ => Err(AppError::validation(format!("알 수 없는 동기화 엔터티입니다: {value}"))),
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
enum SyncOutboxOp {
  Upsert,
  DeleteSourceRecord,
}

impl SyncOutboxOp {
  fn as_str(self) -> &'static str {
    match self {
      Self::Upsert => "upsert",
      Self::DeleteSourceRecord => "delete_source_record",
    }
  }

  fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "upsert" => Ok(Self::Upsert),
      "delete_source_record" => Ok(Self::DeleteSourceRecord),
      _ => Err(AppError::validation(format!("알 수 없는 동기화 작업입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone)]
struct SyncOutboxEntry {
  id: i64,
  entity_type: SyncEntityType,
  entity_id: String,
  op: SyncOutboxOp,
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

pub(crate) struct BuiltApplyOperations {
  request: ApplyOperationsRequest,
  entries_by_record_name: HashMap<String, SyncOutboxEntry>,
}

pub(crate) enum SyncRunPreparation {
  Disabled(ICloudSyncStatus),
  Ready {
    server_change_token: Option<String>,
    has_server_change_token: bool,
  },
}

impl BuiltApplyOperations {
  pub(crate) fn request(&self) -> &ApplyOperationsRequest {
    &self.request
  }

  pub(crate) fn has_operations(&self) -> bool {
    self.request.has_operations()
  }
}

#[derive(Debug, Clone, Copy, Default)]
struct ApplyResponseStats {
  failed_count: usize,
}

impl SqliteStore {
  pub(crate) fn begin_icloud_sync_run(&mut self) -> Result<SyncRunPreparation, AppError> {
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
      has_server_change_token: stored.server_change_token.is_some(),
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
    has_server_change_token: bool,
    changes: &FetchChangesResponse,
  ) -> Result<BuiltApplyOperations, AppError> {
    self.apply_remote_changes(changes)?;
    if !has_server_change_token && changes.is_empty() {
      self.queue_all_active_documents_for_sync()?;
    }
    self.build_apply_operations()
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
      apply_stats = self.process_apply_response(&built.entries_by_record_name, response)?;
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

  pub(crate) fn finish_failed_icloud_sync(&mut self, error: &AppError) -> Result<ICloudSyncStatus, AppError> {
    let (code, message) = classify_sync_error(error);
    self.mark_sync_error(code, &message)?;
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
      params![ICLOUD_SCOPE_PRIVATE, ICLOUD_ZONE_NAME, ICloudAccountStatus::Unknown.as_str()],
    )?;
    Ok(())
  }

  pub(crate) fn ensure_device_state_row(&self) -> Result<(), AppError> {
    let existing = self
      .connection
      .query_row("SELECT device_id FROM device_state WHERE id = 1", [], |row| row.get::<_, String>(0))
      .optional()?;

    if existing.is_none() {
      self.connection.execute(
        "INSERT INTO device_state (id, device_id) VALUES (1, ?1)",
        params![Self::new_id()],
      )?;
    }

    Ok(())
  }

  pub(crate) fn current_device_id(&self) -> Result<String, AppError> {
    self
      .connection
      .query_row("SELECT device_id FROM device_state WHERE id = 1", [], |row| row.get::<_, String>(0))
      .optional()?
      .ok_or_else(|| AppError::validation("device id를 찾을 수 없습니다."))
  }

  pub(crate) fn get_icloud_sync_status(&self) -> Result<ICloudSyncStatus, AppError> {
    let stored = self.read_cloudkit_state()?;
    let state = if !stored.sync_enabled {
      ICloudSyncState::Disabled
    } else if stored.last_error_message.is_some() {
      ICloudSyncState::Error
    } else {
      ICloudSyncState::Idle
    };

    Ok(ICloudSyncStatus {
      enabled: stored.sync_enabled,
      state,
      account_status: stored.account_status,
      last_sync_started_at_ms: stored.last_sync_started_at_ms,
      last_sync_succeeded_at_ms: stored.last_sync_succeeded_at_ms,
      last_error_code: stored.last_error_code,
      last_error_message: stored.last_error_message,
    })
  }

  pub(crate) fn get_icloud_sync_debug_info(&self) -> Result<(usize, usize, bool, String), AppError> {
    let outbox_count = self.connection.query_row(
      "SELECT COUNT(*) FROM sync_outbox",
      [],
      |row| row.get::<_, i64>(0),
    )? as usize;
    let tombstone_count = self.connection.query_row(
      "SELECT COUNT(*) FROM sync_tombstones",
      [],
      |row| row.get::<_, i64>(0),
    )? as usize;
    let state = self.read_cloudkit_state()?;
    let device_id = self.current_device_id()?;
    Ok((
      outbox_count,
      tombstone_count,
      state.server_change_token.is_some(),
      device_id,
    ))
  }

  pub(crate) fn set_icloud_sync_enabled(&mut self, enabled: bool) -> Result<ICloudSyncStatus, AppError> {
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

  pub(crate) fn run_icloud_sync(&mut self, bridge: &CloudKitBridge) -> Result<ICloudSyncStatus, AppError> {
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
        ICloudAccountStatus::TemporarilyUnavailable => "iCloud 상태를 잠시 확인할 수 없습니다.",
        ICloudAccountStatus::CouldNotDetermine => "iCloud 계정 상태를 확인하지 못했습니다.",
        _ => "iCloud 계정을 사용할 수 없습니다.",
      };
      self.mark_sync_error("account_unavailable", message)?;
      return self.get_icloud_sync_status();
    }

    bridge.ensure_zone(ICLOUD_ZONE_NAME)?;

    let current_state = self.read_cloudkit_state()?;
    let changes = self.fetch_remote_changes_with_zone_retry(bridge, current_state.server_change_token.clone())?;
    self.apply_remote_changes(&changes)?;
    self.seed_cloud_from_local_if_needed(&current_state, &changes)?;

    let built = self.build_apply_operations()?;
    let mut apply_stats = ApplyResponseStats::default();
    if built.request.has_operations() {
      let response = bridge.apply_operations(&built.request)?;
      apply_stats = self.process_apply_response(&built.entries_by_record_name, &response)?;
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

  fn seed_cloud_from_local_if_needed(
    &mut self,
    current_state: &StoredCloudKitState,
    changes: &FetchChangesResponse,
  ) -> Result<(), AppError> {
    if current_state.server_change_token.is_some() || !changes.is_empty() {
      return Ok(());
    }

    self.queue_all_active_documents_for_sync()
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
      self.upsert_outbox(entity_type, &entity_id, SyncOutboxOp::DeleteSourceRecord)?;
      self.connection.execute(
        "DELETE FROM sync_tombstones WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type.as_str(), entity_id],
      )?;
    }

    Ok(())
  }

  pub(crate) fn queue_document_snapshot(&mut self, document_id: &str) -> Result<(), AppError> {
    let document = match self.get_document(document_id)? {
      Some(document) => document,
      None => return Ok(()),
    };
    let blocks = self.list_blocks(document_id)?;

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

    self.cancel_outbox(SyncEntityType::Document, document_id, Some(SyncOutboxOp::DeleteSourceRecord))?;
    self.cancel_outbox(
      SyncEntityType::DocumentTombstone,
      document_id,
      Some(SyncOutboxOp::Upsert),
    )?;
    self.upsert_outbox(SyncEntityType::Document, document_id, SyncOutboxOp::Upsert)?;
    self.upsert_outbox(
      SyncEntityType::DocumentTombstone,
      document_id,
      SyncOutboxOp::DeleteSourceRecord,
    )?;

    let block_ids = blocks.iter().map(|block| block.id.clone()).collect::<Vec<_>>();
    for block in blocks {
      self.cancel_outbox(SyncEntityType::Block, &block.id, Some(SyncOutboxOp::DeleteSourceRecord))?;
      self.cancel_outbox(SyncEntityType::BlockTombstone, &block.id, Some(SyncOutboxOp::Upsert))?;
      self.upsert_outbox(SyncEntityType::Block, &block.id, SyncOutboxOp::Upsert)?;
      self.upsert_outbox(
        SyncEntityType::BlockTombstone,
        &block.id,
        SyncOutboxOp::DeleteSourceRecord,
      )?;
    }

    if document.deleted_at.is_none() {
      return Ok(());
    }

    for block_id in block_ids {
      self.upsert_outbox(
        SyncEntityType::BlockTombstone,
        &block_id,
        SyncOutboxOp::DeleteSourceRecord,
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
      self.queue_document_snapshot(&document_id)?;
    }

    Ok(())
  }

  pub(crate) fn queue_document_deletion(&mut self, document_id: &str, deleted_at_ms: i64) -> Result<(), AppError> {
    let device_id = self.current_device_id()?;
    let blocks = self.list_blocks(document_id)?;

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
    self.cancel_outbox(SyncEntityType::Document, document_id, None)?;
    self.cancel_outbox(SyncEntityType::DocumentTombstone, document_id, Some(SyncOutboxOp::DeleteSourceRecord))?;
    self.upsert_outbox(
      SyncEntityType::DocumentTombstone,
      document_id,
      SyncOutboxOp::Upsert,
    )?;
    self.upsert_outbox(
      SyncEntityType::Document,
      document_id,
      SyncOutboxOp::DeleteSourceRecord,
    )?;

    for block in blocks {
      self.upsert_tombstone(
        SyncEntityType::BlockTombstone,
        &block.id,
        Some(document_id),
        deleted_at_ms,
        &self.current_device_id()?,
      )?;
      self.cancel_outbox(SyncEntityType::Block, &block.id, None)?;
      self.cancel_outbox(SyncEntityType::BlockTombstone, &block.id, Some(SyncOutboxOp::DeleteSourceRecord))?;
      self.upsert_outbox(SyncEntityType::BlockTombstone, &block.id, SyncOutboxOp::Upsert)?;
      self.upsert_outbox(SyncEntityType::Block, &block.id, SyncOutboxOp::DeleteSourceRecord)?;
    }

    Ok(())
  }

  pub(crate) fn queue_block_deletion(
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
    self.cancel_outbox(SyncEntityType::Block, block_id, None)?;
    self.cancel_outbox(SyncEntityType::BlockTombstone, block_id, Some(SyncOutboxOp::DeleteSourceRecord))?;
    self.upsert_outbox(SyncEntityType::BlockTombstone, block_id, SyncOutboxOp::Upsert)?;
    self.upsert_outbox(SyncEntityType::Block, block_id, SyncOutboxOp::DeleteSourceRecord)?;
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

  pub(crate) fn set_cloudkit_account_status(&self, account_status: ICloudAccountStatus) -> Result<(), AppError> {
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

  fn count_outbox(&self) -> Result<usize, AppError> {
    let count = self.connection.query_row(
      "SELECT COUNT(*) FROM sync_outbox",
      [],
      |row| row.get::<_, i64>(0),
    )?;
    Ok(count as usize)
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

    let remaining_outbox = self.count_outbox()?;
    if remaining_outbox > 0 {
      let message = format!(
        "iCloud 동기화 후에도 대기 중 변경 {}건이 남아 있습니다. 다시 시도해 주세요.",
        remaining_outbox
      );
      self.mark_sync_error("pending_changes_remaining", &message)?;
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
    self.connection
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

  fn cancel_outbox(
    &self,
    entity_type: SyncEntityType,
    entity_id: &str,
    op: Option<SyncOutboxOp>,
  ) -> Result<(), AppError> {
    match op {
      Some(op) => {
        self.connection.execute(
          "DELETE FROM sync_outbox
           WHERE entity_type = ?1 AND entity_id = ?2 AND op = ?3",
          params![entity_type.as_str(), entity_id, op.as_str()],
        )?;
      }
      None => {
        self.connection.execute(
          "DELETE FROM sync_outbox
           WHERE entity_type = ?1 AND entity_id = ?2",
          params![entity_type.as_str(), entity_id],
        )?;
      }
    }
    Ok(())
  }

  fn upsert_outbox(
    &self,
    entity_type: SyncEntityType,
    entity_id: &str,
    op: SyncOutboxOp,
  ) -> Result<(), AppError> {
    self.connection.execute(
      "INSERT INTO sync_outbox (entity_type, entity_id, op, queued_at_ms, attempt_count, last_error_code)
       VALUES (?1, ?2, ?3, ?4, 0, NULL)
       ON CONFLICT(entity_type, entity_id, op) DO UPDATE SET
         queued_at_ms = excluded.queued_at_ms,
         last_error_code = NULL",
      params![entity_type.as_str(), entity_id, op.as_str(), Self::now()],
    )?;
    Ok(())
  }

  fn list_outbox(&self) -> Result<Vec<SyncOutboxEntry>, AppError> {
    self.connection
      .prepare(
        "SELECT id, entity_type, entity_id, op
         FROM sync_outbox
         ORDER BY queued_at_ms ASC, id ASC",
      )?
      .query_map([], |row| {
        Ok(SyncOutboxEntry {
          id: row.get(0)?,
          entity_type: SyncEntityType::try_from_str(&row.get::<_, String>(1)?)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
          entity_id: row.get(2)?,
          op: SyncOutboxOp::try_from_str(&row.get::<_, String>(3)?)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
        })
      })?
      .collect::<Result<Vec<_>, _>>()
      .map_err(AppError::from)
  }

  fn build_apply_operations(&self) -> Result<BuiltApplyOperations, AppError> {
    let outbox = self.list_outbox()?;
    let mut save_documents = Vec::new();
    let mut save_blocks = Vec::new();
    let mut save_document_tombstones = Vec::new();
    let mut save_block_tombstones = Vec::new();
    let mut delete_record_names = Vec::new();
    let mut entries_by_record_name = HashMap::new();

    for entry in outbox {
      let record_name = entry.entity_type.record_name(&entry.entity_id);
      match entry.op {
        SyncOutboxOp::Upsert => match entry.entity_type {
          SyncEntityType::Document => {
            if let Some(document) = self.get_document(&entry.entity_id)? {
              if document.deleted_at.is_none() {
                save_documents.push(self.document_record(document)?);
                entries_by_record_name.insert(record_name, entry);
              }
            }
          }
          SyncEntityType::Block => {
            if let Ok(block) = self.fetch_block(&entry.entity_id) {
              save_blocks.push(self.block_record(block)?);
              entries_by_record_name.insert(record_name, entry);
            }
          }
          SyncEntityType::DocumentTombstone => {
            if let Some(tombstone) = self.read_tombstone(SyncEntityType::DocumentTombstone, &entry.entity_id)? {
              save_document_tombstones.push(BridgeDocumentTombstoneRecord {
                document_id: tombstone.entity_id,
                deleted_at_ms: tombstone.deleted_at_ms,
                deleted_by_device_id: tombstone.deleted_by_device_id,
              });
              entries_by_record_name.insert(record_name, entry);
            }
          }
          SyncEntityType::BlockTombstone => {
            if let Some(tombstone) = self.read_tombstone(SyncEntityType::BlockTombstone, &entry.entity_id)? {
              save_block_tombstones.push(BridgeBlockTombstoneRecord {
                block_id: tombstone.entity_id,
                document_id: tombstone.parent_document_id.unwrap_or_default(),
                deleted_at_ms: tombstone.deleted_at_ms,
                deleted_by_device_id: tombstone.deleted_by_device_id,
              });
              entries_by_record_name.insert(record_name, entry);
            }
          }
        },
        SyncOutboxOp::DeleteSourceRecord => {
          delete_record_names.push(record_name.clone());
          entries_by_record_name.insert(record_name, entry);
        }
      }
    }

    Ok(BuiltApplyOperations {
      request: ApplyOperationsRequest {
        zone_name: ICLOUD_ZONE_NAME.to_string(),
        save_documents,
        save_blocks,
        save_document_tombstones,
        save_block_tombstones,
        delete_record_names,
      },
      entries_by_record_name,
    })
  }

  fn process_apply_response(
    &self,
    entries_by_record_name: &HashMap<String, SyncOutboxEntry>,
    response: &ApplyOperationsResponse,
  ) -> Result<ApplyResponseStats, AppError> {
    for saved in &response.saved_record_names {
      if let Some(entry) = entries_by_record_name.get(saved) {
        self.connection.execute(
          "DELETE FROM sync_outbox WHERE id = ?1",
          params![entry.id],
        )?;
      }
    }

    for failure in &response.failed {
      if let Some(entry) = entries_by_record_name.get(&failure.record_name) {
        self.connection.execute(
          "UPDATE sync_outbox
           SET attempt_count = attempt_count + 1,
               last_error_code = ?1
           WHERE id = ?2",
          params![failure.error_code, entry.id],
        )?;
      }
    }

    Ok(ApplyResponseStats {
      failed_count: response.failed.len(),
    })
  }

  fn document_record(&self, document: Document) -> Result<BridgeDocumentRecord, AppError> {
    Ok(BridgeDocumentRecord {
      document_id: document.id,
      title: document.title.unwrap_or_default(),
      block_tint_override: document.block_tint_override.map(|value| value.as_str().to_string()),
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
      updated_by_device_id: block.updated_by_device_id.unwrap_or(self.current_device_id()?),
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
        self.queue_document_snapshot(&document_id)?;
      }
    }

    Ok(())
  }

  fn apply_remote_document(&mut self, remote: &BridgeDocumentRecord) -> Result<bool, AppError> {
    let local = self.get_document(&remote.document_id)?;
    let tombstone = self.read_tombstone(SyncEntityType::DocumentTombstone, &remote.document_id)?;

    if let Some(tombstone) = tombstone {
      if compare_logical_clock(
        remote.updated_at_ms,
        &remote.updated_by_device_id,
        tombstone.deleted_at_ms,
        &tombstone.deleted_by_device_id,
      ) <= 0 {
        self.queue_document_deletion(&remote.document_id, tombstone.deleted_at_ms)?;
        return Ok(false);
      }
    }

    if let Some(local) = &local {
      if compare_logical_clock(
        local.updated_at,
        local.updated_by_device_id.as_deref().unwrap_or(""),
        remote.updated_at_ms,
        &remote.updated_by_device_id,
      ) > 0 {
        self.queue_document_snapshot(&remote.document_id)?;
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
          if remote.title.trim().is_empty() { None::<String> } else { Some(remote.title.clone()) },
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
          if remote.title.trim().is_empty() { None::<String> } else { Some(remote.title.clone()) },
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
      params![SyncEntityType::DocumentTombstone.as_str(), remote.document_id],
    )?;
    self.cancel_outbox(
      SyncEntityType::DocumentTombstone,
      &remote.document_id,
      Some(SyncOutboxOp::Upsert),
    )?;
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
      ) > 0 {
        self.queue_document_snapshot(&remote.document_id)?;
        self.upsert_outbox(
          SyncEntityType::DocumentTombstone,
          &remote.document_id,
          SyncOutboxOp::DeleteSourceRecord,
        )?;
        return Ok(false);
      }
    }

    if compare_logical_clock(
      local_deleted_at,
      &local_deleted_by_device_id,
      remote.deleted_at_ms,
      &remote.deleted_by_device_id,
    ) > 0 {
      self.queue_document_deletion(&remote.document_id, local_deleted_at)?;
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
        params![remote.deleted_at_ms, remote.deleted_by_device_id, remote.document_id],
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
    self.ensure_document_placeholder(&remote.document_id, remote.updated_at_ms, &remote.updated_by_device_id)?;
    let local = self.fetch_block(&remote.block_id).ok();
    let tombstone = self.read_tombstone(SyncEntityType::BlockTombstone, &remote.block_id)?;

    if let Some(tombstone) = tombstone {
      if compare_logical_clock(
        remote.updated_at_ms,
        &remote.updated_by_device_id,
        tombstone.deleted_at_ms,
        &tombstone.deleted_by_device_id,
      ) <= 0 {
        self.queue_block_deletion(&remote.block_id, &remote.document_id, tombstone.deleted_at_ms)?;
        return Ok(false);
      }
    }

    if let Some(local) = &local {
      if compare_logical_clock(
        local.updated_at,
        local.updated_by_device_id.as_deref().unwrap_or(""),
        remote.updated_at_ms,
        &remote.updated_by_device_id,
      ) > 0 {
        self.queue_document_snapshot(&remote.document_id)?;
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
    self.cancel_outbox(
      SyncEntityType::BlockTombstone,
      &remote.block_id,
      Some(SyncOutboxOp::Upsert),
    )?;
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
      .query_map(params![document_id, target_position, keep_block_id], |row| row.get::<_, String>(0))?
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
    let local_tombstone = self.read_tombstone(SyncEntityType::BlockTombstone, &remote.block_id)?;

    if let Some(local) = &local {
      if compare_logical_clock(
        local.updated_at,
        local.updated_by_device_id.as_deref().unwrap_or(""),
        remote.deleted_at_ms,
        &remote.deleted_by_device_id,
      ) > 0 {
        self.queue_document_snapshot(&remote.document_id)?;
        self.upsert_outbox(
          SyncEntityType::BlockTombstone,
          &remote.block_id,
          SyncOutboxOp::DeleteSourceRecord,
        )?;
        return Ok(false);
      }
    }

    if let Some(local_tombstone) = local_tombstone {
      if compare_logical_clock(
        local_tombstone.deleted_at_ms,
        &local_tombstone.deleted_by_device_id,
        remote.deleted_at_ms,
        &remote.deleted_by_device_id,
      ) > 0 {
        self.queue_block_deletion(&remote.block_id, &remote.document_id, local_tombstone.deleted_at_ms)?;
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
      self.connection.execute(
        "DELETE FROM blocks WHERE id = ?1",
        params![remote.block_id],
      )?;
      self.ensure_document_has_block(&remote.document_id)?;
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
      self.queue_document_snapshot(document_id)?;
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
      .query_map(params![document_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?
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

fn classify_sync_error(error: &AppError) -> (&'static str, String) {
  match error {
    AppError::Validation(message) if is_connectivity_error_message(message) => (
      "network_unavailable",
      "인터넷 연결을 확인한 뒤 다시 시도해 주세요.".to_string(),
    ),
    AppError::Validation(message) if message.contains("Zone does not exist") => (
      "zone_not_ready",
      "iCloud 동기화 영역을 아직 준비하는 중입니다. 잠시 후 다시 시도해 주세요.".to_string(),
    ),
    AppError::Validation(message) => ("sync_failed", message.clone()),
    _ => ("sync_failed", error.to_string()),
  }
}

fn is_connectivity_error_message(message: &str) -> bool {
  let lower = message.to_ascii_lowercase();
  [
    "nsurlerrordomain:-1009",
    "nsurlerrordomain:-1005",
    "nsurlerrordomain:-1001",
    "not connected to the internet",
    "internet connection appears to be offline",
    "network connection was lost",
    "network is offline",
    "network unavailable",
    "could not connect to the server",
    "connection was lost",
    "timed out",
    "offline",
  ]
  .iter()
  .any(|pattern| lower.contains(pattern))
}

impl FetchChangesResponse {
  fn is_empty(&self) -> bool {
    self.documents.is_empty()
      && self.blocks.is_empty()
      && self.document_tombstones.is_empty()
      && self.block_tombstones.is_empty()
  }
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  use super::*;
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

    let status = store.get_icloud_sync_status().expect("sync status should load");

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
    let outbox = store.list_outbox().expect("outbox should load");

    assert!(tombstone.is_some());
    assert!(outbox.iter().any(|entry| {
      entry.entity_type == SyncEntityType::DocumentTombstone
        && entry.entity_id == document.id
        && entry.op == SyncOutboxOp::Upsert
    }));
    assert!(outbox.iter().any(|entry| {
      entry.entity_type == SyncEntityType::Document
        && entry.entity_id == document.id
        && entry.op == SyncOutboxOp::DeleteSourceRecord
    }));
  }

  #[test]
  fn sync_completion_fails_when_outbox_still_has_pending_entries() {
    let mut store = test_store();
    let document = store
      .create_document(Some("pending 문서".to_string()))
      .expect("document should be created");
    store
      .set_icloud_sync_enabled(true)
      .expect("sync should enable");

    let result = store.ensure_sync_completion_succeeded(
      ApplyResponseStats {
        failed_count: 0,
      },
    );

    assert!(result.is_err());

    let status = store.get_icloud_sync_status().expect("sync status should load");
    assert_eq!(status.state, ICloudSyncState::Error);
    assert_eq!(status.last_error_code.as_deref(), Some("pending_changes_remaining"));
    assert!(status
      .last_error_message
      .as_deref()
      .is_some_and(|message| message.contains("대기 중 변경")));

    let outbox = store.list_outbox().expect("outbox should load");
    assert!(outbox.iter().any(|entry| entry.entity_id == document.id));
  }

  #[test]
  fn sync_completion_fails_when_apply_response_has_failures() {
    let mut store = test_store();
    store
      .set_icloud_sync_enabled(true)
      .expect("sync should enable");

    let result = store.ensure_sync_completion_succeeded(
      ApplyResponseStats {
        failed_count: 2,
      },
    );

    assert!(result.is_err());

    let status = store.get_icloud_sync_status().expect("sync status should load");
    assert_eq!(status.state, ICloudSyncState::Error);
    assert_eq!(status.last_error_code.as_deref(), Some("apply_partial_failure"));
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
    let final_ids = final_blocks.iter().map(|block| block.id.as_str()).collect::<Vec<_>>();
    let final_positions = final_blocks.iter().map(|block| block.position).collect::<Vec<_>>();

    assert_eq!(
      final_ids,
      reordered.iter().map(|block| block.id.as_str()).collect::<Vec<_>>()
    );
    assert_eq!(final_positions, vec![0, 1, 2]);
  }

  #[test]
  fn first_sync_with_empty_cloud_backfills_all_local_documents() {
    let mut store = test_store();
    let first = store
      .create_document(Some("첫 문서".to_string()))
      .expect("first document should be created");
    let second = store
      .create_document(Some("둘째 문서".to_string()))
      .expect("second document should be created");

    store
      .connection
      .execute("DELETE FROM sync_outbox", [])
      .expect("outbox should clear");

    let state = store.read_cloudkit_state().expect("state should load");
    store
      .seed_cloud_from_local_if_needed(
        &state,
        &FetchChangesResponse {
          documents: vec![],
          blocks: vec![],
          document_tombstones: vec![],
          block_tombstones: vec![],
          next_server_change_token: None,
        },
      )
      .expect("backfill should queue local documents");

    let outbox = store.list_outbox().expect("outbox should load");
    assert!(outbox.iter().any(|entry| entry.entity_id == first.id));
    assert!(outbox.iter().any(|entry| entry.entity_id == second.id));
  }

  #[test]
  fn first_sync_with_remote_records_skips_local_backfill() {
    let mut store = test_store();
    let local = store
      .create_document(Some("로컬 문서".to_string()))
      .expect("local document should be created");

    store
      .connection
      .execute("DELETE FROM sync_outbox", [])
      .expect("outbox should clear");

    let state = store.read_cloudkit_state().expect("state should load");
    store
      .seed_cloud_from_local_if_needed(
        &state,
        &FetchChangesResponse {
          documents: vec![BridgeDocumentRecord {
            document_id: "remote-doc".to_string(),
            title: "원격 문서".to_string(),
            block_tint_override: None,
            document_surface_tone_override: None,
            updated_at_ms: SqliteStore::now(),
            updated_by_device_id: "remote-device".to_string(),
          }],
          blocks: vec![],
          document_tombstones: vec![],
          block_tombstones: vec![],
          next_server_change_token: None,
        },
      )
      .expect("remote-first sync should skip backfill");

    let outbox = store.list_outbox().expect("outbox should load");
    assert!(!outbox.iter().any(|entry| entry.entity_id == local.id));
  }
}
