use super::*;

pub(crate) const BLOCK_COLUMNS: &str =
  "id, document_id, kind, position, content, search_text, language, created_at, updated_at, updated_by_device_id";

pub(crate) fn map_block(row: &rusqlite::Row<'_>) -> rusqlite::Result<Block> {
  Ok(Block {
    id: row.get(0)?,
    document_id: row.get(1)?,
    kind: BlockKind::try_from_str(row.get::<_, String>(2)?.as_str())
      .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
    position: row.get(3)?,
    content: row.get(4)?,
    search_text: row.get(5)?,
    language: row.get(6)?,
    created_at: row.get(7)?,
    updated_at: row.get(8)?,
    updated_by_device_id: row.get(9)?,
  })
}

impl SqliteStore {
  pub(crate) fn insert_empty_block(
    connection: &Connection,
    document_id: &str,
    position: i64,
    kind: BlockKind,
  ) -> Result<Block, AppError> {
    let now = Self::now();
    Self::insert_empty_block_with_timestamps(connection, document_id, position, kind, now, now)
  }

  pub(crate) fn insert_empty_block_with_timestamps(
    connection: &Connection,
    document_id: &str,
    position: i64,
    kind: BlockKind,
    created_at: i64,
    updated_at: i64,
  ) -> Result<Block, AppError> {
    let content = match kind {
      BlockKind::Markdown => String::new(),
      BlockKind::Code | BlockKind::Text => String::new(),
    };
    let language = matches!(kind, BlockKind::Code).then(|| "plaintext".to_string());
    let search_text = String::new();
    let block = Block {
      id: Self::new_id(),
      document_id: document_id.to_string(),
      kind,
      position,
      content,
      search_text,
      language,
      created_at,
      updated_at,
      updated_by_device_id: None,
    };

    connection.execute(
      "INSERT INTO blocks (id, document_id, kind, position, content, search_text, language, created_at, updated_at, updated_by_device_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      params![
        block.id,
        block.document_id,
        block.kind.as_str(),
        block.position,
        block.content,
        block.search_text,
        block.language,
        block.created_at,
        block.updated_at,
        block.updated_by_device_id
      ],
    )?;

    Ok(block)
  }

  pub(crate) fn create_empty_block(
    &self,
    document_id: &str,
    position: i64,
    kind: BlockKind,
  ) -> Result<Block, AppError> {
    Self::insert_empty_block(&self.connection, document_id, position, kind)
  }

  pub(crate) fn document_preview(&self, document_id: &str) -> Result<String, AppError> {
    let preview = self
      .connection
      .query_row(
        "SELECT search_text FROM blocks WHERE document_id = ?1 AND trim(search_text) != '' ORDER BY position LIMIT 1",
        params![document_id],
        |row| row.get::<_, String>(0),
      )
      .optional()?;

    Ok(preview.unwrap_or_default())
  }

  pub(crate) fn rewrite_positions(
    connection: &Connection,
    _document_id: &str,
    ordered_ids: &[String],
  ) -> Result<(), AppError> {
    let n = ordered_ids.len() as i64;

    for (index, block_id) in ordered_ids.iter().enumerate() {
      connection.execute(
        "UPDATE blocks SET position = ?1 WHERE id = ?2",
        params![-(n + 1 + index as i64), block_id],
      )?;
    }

    for (index, block_id) in ordered_ids.iter().enumerate() {
      connection.execute(
        "UPDATE blocks SET position = ?1 WHERE id = ?2",
        params![index as i64, block_id],
      )?;
    }

    Ok(())
  }

  pub(crate) fn normalize_positions(&mut self, document_id: &str) -> Result<(), AppError> {
    let transaction = self.connection.transaction()?;
    let block_ids = transaction
      .prepare("SELECT id FROM blocks WHERE document_id = ?1 ORDER BY position ASC")?
      .query_map(params![document_id], |row| row.get::<_, String>(0))?
      .collect::<Result<Vec<_>, _>>()?;

    Self::rewrite_positions(&transaction, document_id, &block_ids)?;
    transaction.commit()?;
    Ok(())
  }

  pub(crate) fn block_document_id(&self, block_id: &str) -> Result<String, AppError> {
    self.connection
      .query_row(
        "SELECT document_id FROM blocks WHERE id = ?1",
        params![block_id],
        |row| row.get::<_, String>(0),
      )
      .optional()?
      .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))
  }

  pub(crate) fn fetch_block(&self, block_id: &str) -> Result<Block, AppError> {
    self.connection
      .query_row(
        &format!("SELECT {BLOCK_COLUMNS} FROM blocks WHERE id = ?1"),
        params![block_id],
        map_block,
      )
      .optional()?
      .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))
  }

  pub(crate) fn document_summary_from_document(
    &self,
    document: Document,
  ) -> Result<DocumentSummary, AppError> {
    let block_count = self
      .connection
      .query_row(
        "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
        params![document.id],
        |row| row.get::<_, i64>(0),
      )? as usize;
    let preview = self.document_preview(&document.id)?;

    Ok(DocumentSummary {
      id: document.id,
      title: document.title,
      block_tint_override: document.block_tint_override,
      document_surface_tone_override: document.document_surface_tone_override,
      preview,
      updated_at: document.updated_at,
      last_opened_at: document.last_opened_at,
      block_count,
    })
  }

  pub(crate) fn collect_document_summaries(
    &self,
    documents: Vec<Document>,
  ) -> Result<Vec<DocumentSummary>, AppError> {
    documents
      .into_iter()
      .map(|document| self.document_summary_from_document(document))
      .collect()
  }
}
