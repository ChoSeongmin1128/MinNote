use super::*;

impl SqliteStore {
  pub(crate) fn initialize(&self) -> Result<(), AppError> {
    self.connection.execute_batch(
      &format!(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          title TEXT NULL,
          block_tint_override TEXT NULL,
          document_surface_tone_override TEXT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_opened_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS blocks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          position INTEGER NOT NULL,
          content TEXT NOT NULL,
          search_text TEXT NOT NULL DEFAULT '',
          language TEXT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(document_id, position)
        );

        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          op TEXT NOT NULL,
          queued_at_ms INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error_code TEXT NULL,
          UNIQUE(entity_type, entity_id, op)
        );

        CREATE TABLE IF NOT EXISTS sync_tombstones (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          parent_document_id TEXT NULL,
          deleted_at_ms INTEGER NOT NULL,
          deleted_by_device_id TEXT NOT NULL,
          purge_after_ms INTEGER NOT NULL,
          PRIMARY KEY(entity_type, entity_id)
        );

        CREATE TABLE IF NOT EXISTS cloudkit_state (
          scope TEXT PRIMARY KEY,
          zone_name TEXT NOT NULL,
          server_change_token TEXT NULL,
          last_sync_started_at_ms INTEGER NULL,
          last_sync_succeeded_at_ms INTEGER NULL,
          last_error_code TEXT NULL,
          last_error_message TEXT NULL,
          account_status TEXT NOT NULL,
          sync_enabled INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_operations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_type TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          document_id TEXT NULL,
          payload_json TEXT NOT NULL,
          logical_clock INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error_code TEXT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE INDEX IF NOT EXISTS idx_sync_operations_status_created
          ON sync_operations(status, created_at_ms, id);

        CREATE INDEX IF NOT EXISTS idx_sync_operations_entity
          ON sync_operations(entity_type, entity_id, status);

        CREATE TABLE IF NOT EXISTS device_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          device_id TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS {SEARCH_INDEX_TABLE} USING fts5 (
          document_id UNINDEXED,
          title,
          content
        );
        "#,
      ),
    )?;

    self.ensure_document_column("block_tint_override", "TEXT NULL")?;
    self.ensure_document_column("document_surface_tone_override", "TEXT NULL")?;
    self.ensure_document_column("deleted_at", "INTEGER NULL")?;
    self.ensure_document_column("updated_by_device_id", "TEXT NULL")?;
    self.ensure_block_column("updated_by_device_id", "TEXT NULL")?;
    self.ensure_app_state_value("theme_mode", DEFAULT_THEME_MODE)?;
    self.ensure_app_state_value("default_block_tint_preset", DEFAULT_BLOCK_TINT_PRESET)?;
    self.ensure_app_state_value("default_document_surface_tone_preset", DEFAULT_DOCUMENT_SURFACE_TONE_PRESET)?;
    self.ensure_app_state_value("default_block_kind", DEFAULT_BLOCK_KIND)?;
    self.ensure_app_state_value("body_font_family", DEFAULT_BODY_FONT_FAMILY)?;
    self.ensure_app_state_value("body_font_size_px", DEFAULT_BODY_FONT_SIZE_PX)?;
    self.ensure_app_state_value("code_font_family", DEFAULT_CODE_FONT_FAMILY)?;
    self.ensure_app_state_value("code_font_size_px", DEFAULT_CODE_FONT_SIZE_PX)?;
    self.ensure_app_state_value("menu_bar_icon_enabled", DEFAULT_MENU_BAR_ICON_ENABLED)?;
    self.ensure_app_state_value("always_on_top_enabled", DEFAULT_ALWAYS_ON_TOP_ENABLED)?;
    self.ensure_app_state_value("window_opacity_percent", DEFAULT_WINDOW_OPACITY_PERCENT)?;
    self.ensure_app_state_value("global_toggle_shortcut", DEFAULT_GLOBAL_TOGGLE_SHORTCUT)?;
    self.ensure_cloudkit_state_row()?;
    self.ensure_device_state_row()?;
    self.ensure_sync_operations_defaults()?;
    self.migrate_legacy_sync_outbox_to_operations()?;
    self.cleanup_removed_sync_state()?;

    Ok(())
  }

  fn ensure_document_column(&self, column_name: &str, column_definition: &str) -> Result<(), AppError> {
    let mut statement = self.connection.prepare("PRAGMA table_info(documents)")?;
    let columns = statement
      .query_map([], |row| row.get::<_, String>(1))?
      .collect::<Result<Vec<_>, _>>()?;

    if columns.iter().any(|column| column == column_name) {
      return Ok(());
    }

    self.connection.execute(
      &format!("ALTER TABLE documents ADD COLUMN {column_name} {column_definition}"),
      [],
    )?;
    Ok(())
  }

  fn ensure_block_column(&self, column_name: &str, column_definition: &str) -> Result<(), AppError> {
    let mut statement = self.connection.prepare("PRAGMA table_info(blocks)")?;
    let columns = statement
      .query_map([], |row| row.get::<_, String>(1))?
      .collect::<Result<Vec<_>, _>>()?;

    if columns.iter().any(|column| column == column_name) {
      return Ok(());
    }

    self.connection.execute(
      &format!("ALTER TABLE blocks ADD COLUMN {column_name} {column_definition}"),
      [],
    )?;
    Ok(())
  }

  fn ensure_app_state_value(&self, key: &str, value: &str) -> Result<(), AppError> {
    self.connection.execute(
      "INSERT INTO app_state (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO NOTHING",
      params![key, value],
    )?;
    Ok(())
  }

  fn cleanup_removed_sync_state(&self) -> Result<(), AppError> {
    self.connection.execute(
      "DELETE FROM app_state WHERE key IN ('icloud_sync_enabled', 'icloud_sync_mode')",
      [],
    )?;
    Ok(())
  }
}
