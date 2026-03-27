use crate::application::dto::{BootstrapPayload, DocumentSummaryDto};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

use super::{TRASH_TTL_MS, build_bootstrap_payload};

pub fn bootstrap_app(repository: &mut dyn AppRepository) -> Result<BootstrapPayload, AppError> {
  repository.purge_expired_trash(super::now_ms() - TRASH_TTL_MS)?;
  repository.ensure_initial_document()?;
  repository.migrate_legacy_markdown_blocks()?;
  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;
  let current_document_id = repository
    .get_last_opened_document_id()?
    .or_else(|| documents.first().map(|document| document.id.clone()));

  let current_document = current_document_id
    .as_deref()
    .map(|document_id| super::documents::open_document(repository, document_id))
    .transpose()?;

  Ok(build_bootstrap_payload(
    settings,
    documents,
    trash_documents,
    current_document,
  ))
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
