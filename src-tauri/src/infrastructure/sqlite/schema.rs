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
    self.ensure_app_state_value("theme_mode", DEFAULT_THEME_MODE)?;
    self.ensure_app_state_value("default_block_tint_preset", DEFAULT_BLOCK_TINT_PRESET)?;
    self.ensure_app_state_value("default_document_surface_tone_preset", DEFAULT_DOCUMENT_SURFACE_TONE_PRESET)?;
    self.ensure_app_state_value("icloud_sync_enabled", DEFAULT_ICLOUD_SYNC_ENABLED)?;

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

  fn ensure_app_state_value(&self, key: &str, value: &str) -> Result<(), AppError> {
    self.connection.execute(
      "INSERT INTO app_state (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO NOTHING",
      params![key, value],
    )?;
    Ok(())
  }
}
