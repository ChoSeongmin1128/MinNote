use super::common::DocumentTimestampTarget;
use super::*;

mod row_mapping;
#[cfg(test)]
mod tests;

use row_mapping::{map_document, DOCUMENT_COLUMNS};

impl DocumentRepository for SqliteStore {
  fn ensure_initial_document(&mut self) -> Result<(), AppError> {
    let count = self
      .connection
      .query_row("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL", [], |row| {
        row.get::<_, i64>(0)
      })?;
    if count > 0 {
      return Ok(());
    }

    self.create_document(None)?;
    Ok(())
  }

  fn list_documents(&self) -> Result<Vec<DocumentSummary>, AppError> {
    let mut statement = self.connection.prepare(&format!(
      "SELECT {DOCUMENT_COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC"
    ))?;

    let documents = statement
      .query_map([], map_document)?
      .collect::<Result<Vec<_>, _>>()?;

    self.collect_document_summaries(documents)
  }

  fn list_trash_documents(&self) -> Result<Vec<DocumentSummary>, AppError> {
    let mut statement = self.connection.prepare(&format!(
      "SELECT {DOCUMENT_COLUMNS} FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ))?;

    let documents = statement
      .query_map([], map_document)?
      .collect::<Result<Vec<_>, _>>()?;

    self.collect_document_summaries(documents)
  }

  fn get_document(&self, document_id: &str) -> Result<Option<Document>, AppError> {
    self
      .connection
      .query_row(
        &format!("SELECT {DOCUMENT_COLUMNS} FROM documents WHERE id = ?1"),
        params![document_id],
        map_document,
      )
      .optional()
      .map_err(AppError::from)
  }

  fn create_document(&mut self, title: Option<String>) -> Result<Document, AppError> {
    let now = Self::now();
    let device_id = self.current_device_id()?;
    let unique_title = self.unique_document_title(title, None)?;
    let document = Document {
      id: Self::new_id(),
      title: Some(unique_title),
      block_tint_override: None,
      document_surface_tone_override: None,
      created_at: now,
      updated_at: now,
      updated_by_device_id: Some(device_id),
      last_opened_at: now,
      deleted_at: None,
    };

    self.connection.execute(
      "INSERT INTO documents (id, title, block_tint_override, document_surface_tone_override, created_at, updated_at, updated_by_device_id, last_opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![
        document.id,
        document.title,
        Option::<String>::None,
        Option::<String>::None,
        document.created_at,
        document.updated_at,
        document.updated_by_device_id,
        document.last_opened_at
      ],
    )?;

    self.create_empty_block(&document.id, 0, BlockKind::Markdown)?;
    let document = self.finish_document_structure_mutation(&document.id)?;
    self.record_document_created(&document.id)?;
    for block in self.list_blocks(&document.id)? {
      self.record_block_created(&block.id, &document.id)?;
    }
    Ok(document)
  }

  fn rename_document(&mut self, document_id: &str, title: Option<String>) -> Result<Document, AppError> {
    let normalized = self.unique_document_title(title, Some(document_id))?;
    self.connection.execute(
      "UPDATE documents SET title = ?1 WHERE id = ?2",
      params![normalized, document_id],
    )?;
    let document = self.finish_document_mutation(document_id)?;
    self.record_document_renamed(document_id)?;
    Ok(document)
  }

  fn delete_document(&mut self, document_id: &str) -> Result<(), AppError> {
    let now = Self::now();
    self.connection.execute(
      "UPDATE documents SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
      params![now, document_id],
    )?;
    self.record_document_deletion(document_id, now)?;
    Ok(())
  }

  fn restore_document_from_trash(&mut self, document_id: &str) -> Result<Document, AppError> {
    let now = Self::now();
    self.connection.execute(
      "UPDATE documents SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
      params![now, document_id],
    )?;
    let document = self
      .get_document(document_id)?
      .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))?;
    self.record_document_restored(document_id)?;
    Ok(document)
  }

  fn purge_expired_trash(&mut self, cutoff_ms: i64) -> Result<(), AppError> {
    let expired_ids: Vec<String> = self
      .connection
      .prepare(
        "SELECT id
         FROM documents
         WHERE deleted_at IS NOT NULL
           AND deleted_at < ?1",
      )?
      .query_map(params![cutoff_ms], |row| row.get::<_, String>(0))?
      .collect::<Result<Vec<_>, _>>()?;

    for id in &expired_ids {
      self.connection.execute(
        &format!("DELETE FROM {SEARCH_INDEX_TABLE} WHERE document_id = ?1"),
        params![id],
      )?;
    }

    self.connection.execute(
      "DELETE FROM documents
       WHERE deleted_at IS NOT NULL
         AND deleted_at < ?1",
      params![cutoff_ms],
    )?;

    Ok(())
  }

  fn empty_trash(&mut self) -> Result<(), AppError> {
    let trash_ids: Vec<String> = self
      .connection
      .prepare(
        "SELECT id
         FROM documents
         WHERE deleted_at IS NOT NULL",
      )?
      .query_map([], |row| row.get::<_, String>(0))?
      .collect::<Result<Vec<_>, _>>()?;

    for id in &trash_ids {
      self.connection.execute(
        &format!("DELETE FROM {SEARCH_INDEX_TABLE} WHERE document_id = ?1"),
        params![id],
      )?;
    }

    self.connection.execute(
      "DELETE FROM documents
       WHERE deleted_at IS NOT NULL",
      [],
    )?;
    self.purge_expired_tombstones(Self::now())?;

    Ok(())
  }

  fn delete_all_documents(&mut self) -> Result<(), AppError> {
    let document_ids = self
      .connection
      .prepare("SELECT id FROM documents")?
      .query_map([], |row| row.get::<_, String>(0))?
      .collect::<Result<Vec<_>, _>>()?;
    let now = Self::now();

    for document_id in &document_ids {
      self.record_document_deletion(document_id, now)?;
    }
    self.connection.execute(&format!("DELETE FROM {SEARCH_INDEX_TABLE}"), [])?;
    self.connection.execute("DELETE FROM documents", [])?;
    Ok(())
  }

  fn set_document_block_tint_override(
    &mut self,
    document_id: &str,
    block_tint_override: Option<BlockTintPreset>,
  ) -> Result<Document, AppError> {
    let value = block_tint_override.map(|preset| preset.as_str().to_string());
    self.connection.execute(
      "UPDATE documents SET block_tint_override = ?1 WHERE id = ?2",
      params![value, document_id],
    )?;
    let document = self.finish_document_mutation(document_id)?;
    self.record_document_style_updated(document_id)?;
    Ok(document)
  }

  fn set_document_surface_tone_override(
    &mut self,
    document_id: &str,
    document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  ) -> Result<Document, AppError> {
    let value = document_surface_tone_override.map(|preset| preset.as_str().to_string());
    self.connection.execute(
      "UPDATE documents SET document_surface_tone_override = ?1 WHERE id = ?2",
      params![value, document_id],
    )?;
    let document = self.finish_document_mutation(document_id)?;
    self.record_document_style_updated(document_id)?;
    Ok(document)
  }

  fn mark_document_opened(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.finish_document_open(document_id)
  }

  fn search_documents(&self, query: &str) -> Result<Vec<SearchResult>, AppError> {
    if query.trim().is_empty() {
      return Ok(Vec::new());
    }

    let mut statement = self.connection.prepare(&format!(
      "SELECT document_id, bm25({SEARCH_INDEX_TABLE}) as score
       FROM {SEARCH_INDEX_TABLE}
       WHERE {SEARCH_INDEX_TABLE} MATCH ?1
       ORDER BY score"
    ))?;

    let ids = statement
      .query_map(params![query], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))?
      .collect::<Result<Vec<_>, _>>()?;

    ids
      .into_iter()
      .filter_map(|(document_id, score)| match self.get_document(&document_id) {
        Ok(Some(document)) if document.deleted_at.is_none() => Some(Ok((document, score))),
        Ok(_) => None,
        Err(error) => Some(Err(error)),
      })
      .map(|entry| {
        let (document, score) = entry?;
        let summary = self.document_summary_from_document(document)?;

        Ok(SearchResult {
          summary,
          score,
        })
      })
      .collect()
  }

  fn touch_document(&mut self, document_id: &str) -> Result<i64, AppError> {
    Ok(self.touch_document_timestamp(document_id, DocumentTimestampTarget::UpdatedAt)?.updated_at)
  }
}
