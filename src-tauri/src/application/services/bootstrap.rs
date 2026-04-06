use crate::application::dto::{BootstrapPayload, DocumentSummaryDto};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

use super::{TRASH_TTL_MS, build_workspace_payload};

pub fn bootstrap_app(repository: &mut dyn AppRepository) -> Result<BootstrapPayload, AppError> {
  repository.purge_expired_trash(super::now_ms() - TRASH_TTL_MS)?;
  repository.ensure_initial_document()?;
  repository.migrate_legacy_markdown_blocks()?;
  let last_opened_document_id = repository.get_last_opened_document_id()?;
  build_workspace_payload(repository, last_opened_document_id)
}

pub fn list_documents(repository: &mut dyn AppRepository) -> Result<Vec<DocumentSummaryDto>, AppError> {
  Ok(
    repository
      .list_documents()?
      .into_iter()
      .map(DocumentSummaryDto::from)
      .collect::<Vec<_>>(),
  )
}

pub fn list_trash_documents(repository: &mut dyn AppRepository) -> Result<Vec<DocumentSummaryDto>, AppError> {
  Ok(
    repository
      .list_trash_documents()?
      .into_iter()
      .map(DocumentSummaryDto::from)
      .collect::<Vec<_>>(),
  )
}
