use super::*;

const DOCUMENT_COLUMNS: &str =
  "id, title, block_tint_override, document_surface_tone_override, created_at, updated_at, last_opened_at, deleted_at";

fn map_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
  Ok(Document {
    id: row.get(0)?,
    title: row.get(1)?,
    block_tint_override: row
      .get::<_, Option<String>>(2)?
      .map(|value| BlockTintPreset::try_from_str(&value))
      .transpose()
      .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
    document_surface_tone_override: row
      .get::<_, Option<String>>(3)?
      .map(|value| DocumentSurfaceTonePreset::try_from_str(&value))
      .transpose()
      .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
    created_at: row.get(4)?,
    updated_at: row.get(5)?,
    last_opened_at: row.get(6)?,
    deleted_at: row.get(7)?,
  })
}

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

    documents
      .into_iter()
      .map(|document| {
        let block_count = self
          .connection
          .query_row(
            "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
            params![document.id],
            |row| row.get::<_, i64>(0),
          )
          .unwrap_or(0) as usize;
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
      })
      .collect()
  }

  fn list_trash_documents(&self) -> Result<Vec<DocumentSummary>, AppError> {
    let mut statement = self.connection.prepare(&format!(
      "SELECT {DOCUMENT_COLUMNS} FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ))?;

    let documents = statement
      .query_map([], map_document)?
      .collect::<Result<Vec<_>, _>>()?;

    documents
      .into_iter()
      .map(|document| {
        let block_count = self
          .connection
          .query_row(
            "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
            params![document.id],
            |row| row.get::<_, i64>(0),
          )
          .unwrap_or(0) as usize;
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
      })
      .collect()
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
    let unique_title = self.unique_document_title(title, None)?;
    let document = Document {
      id: Self::new_id(),
      title: Some(unique_title),
      block_tint_override: None,
      document_surface_tone_override: None,
      created_at: now,
      updated_at: now,
      last_opened_at: now,
      deleted_at: None,
    };

    self.connection.execute(
      "INSERT INTO documents (id, title, block_tint_override, document_surface_tone_override, created_at, updated_at, last_opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![
        document.id,
        document.title,
        Option::<String>::None,
        Option::<String>::None,
        document.created_at,
        document.updated_at,
        document.last_opened_at
      ],
    )?;

    self.create_empty_block(&document.id, 0, BlockKind::Markdown)?;
    self.finish_document_mutation(&document.id)?;
    Ok(document)
  }

  fn rename_document(&mut self, document_id: &str, title: Option<String>) -> Result<Document, AppError> {
    let normalized = self.unique_document_title(title, Some(document_id))?;
    self.connection.execute(
      "UPDATE documents SET title = ?1 WHERE id = ?2",
      params![normalized, document_id],
    )?;
    self.finish_document_mutation(document_id)
  }

  fn delete_document(&mut self, document_id: &str) -> Result<(), AppError> {
    let now = Self::now();
    self.connection.execute(
      "UPDATE documents SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
      params![now, document_id],
    )?;
    Ok(())
  }

  fn restore_document_from_trash(&mut self, document_id: &str) -> Result<Document, AppError> {
    let now = Self::now();
    self.connection.execute(
      "UPDATE documents SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
      params![now, document_id],
    )?;
    self
      .get_document(document_id)?
      .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))
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

    Ok(())
  }

  fn delete_all_documents(&mut self) -> Result<(), AppError> {
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
    self.finish_document_mutation(document_id)
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
    self.finish_document_mutation(document_id)
  }

  fn mark_document_opened(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.touch_document_internal(document_id, true)
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
        let preview = self.document_preview(&document.id)?;
        let block_count = self
          .connection
          .query_row(
            "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
            params![document.id],
            |row| row.get::<_, i64>(0),
          )
          .unwrap_or(0) as usize;

        Ok(SearchResult {
          summary: DocumentSummary {
            id: document.id,
            title: document.title,
            block_tint_override: document.block_tint_override,
            document_surface_tone_override: document.document_surface_tone_override,
            preview,
            updated_at: document.updated_at,
            last_opened_at: document.last_opened_at,
            block_count,
          },
          score,
        })
      })
      .collect()
  }

  fn touch_document(&mut self, document_id: &str) -> Result<i64, AppError> {
    Ok(self.touch_document_internal(document_id, false)?.updated_at)
  }
}
