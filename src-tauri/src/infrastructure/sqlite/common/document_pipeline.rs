use super::*;

impl SqliteStore {
  pub(crate) fn touch_document_timestamp(
    &self,
    document_id: &str,
    target: DocumentTimestampTarget,
  ) -> Result<Document, AppError> {
    let now = Self::now();
    match target {
      DocumentTimestampTarget::UpdatedAt => {
        let device_id = self.current_device_id()?;
        self.connection.execute(
          "UPDATE documents SET updated_at = ?1, updated_by_device_id = ?2 WHERE id = ?3",
          params![now, device_id, document_id],
        )?;
      }
      DocumentTimestampTarget::LastOpenedAt => {
        self.connection.execute(
          "UPDATE documents SET last_opened_at = ?1 WHERE id = ?2",
          params![now, document_id],
        )?;
      }
    }

    self.get_document(document_id)?
      .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))
  }

  pub(crate) fn finish_document_open(&self, document_id: &str) -> Result<Document, AppError> {
    self.touch_document_timestamp(document_id, DocumentTimestampTarget::LastOpenedAt)
  }

  pub(crate) fn finish_document_mutation(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.rebuild_search_index(document_id)?;
    self.touch_document_timestamp(document_id, DocumentTimestampTarget::UpdatedAt)
  }

  pub(crate) fn finish_document_structure_mutation(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.normalize_positions(document_id)?;
    self.finish_document_mutation(document_id)
  }
}
