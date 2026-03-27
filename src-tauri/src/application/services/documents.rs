use crate::application::dto::{BootstrapPayload, DocumentDto, SearchResultDto};
use crate::domain::models::{BlockTintPreset, DocumentSurfaceTonePreset};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

use super::{build_bootstrap_payload, hydrate_document};

pub fn open_document(repository: &mut dyn AppRepository, document_id: &str) -> Result<DocumentDto, AppError> {
  let document = repository.mark_document_opened(document_id)?;
  repository.set_last_opened_document_id(document_id)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn create_document(repository: &mut dyn AppRepository) -> Result<DocumentDto, AppError> {
  let document = repository.create_document(None)?;
  let document_id = document.id.clone();
  repository.set_last_opened_document_id(&document_id)?;
  hydrate_document(repository, &document_id, Some(document))
}

pub fn rename_document(
  repository: &mut dyn AppRepository,
  document_id: &str,
  title: Option<String>,
) -> Result<DocumentDto, AppError> {
  let document = repository.rename_document(document_id, title)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn delete_document(
  repository: &mut dyn AppRepository,
  document_id: &str,
) -> Result<BootstrapPayload, AppError> {
  repository.delete_document(document_id)?;
  repository.ensure_initial_document()?;
  let settings = repository.get_app_settings()?;

  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;
  let current_document_id = repository
    .get_last_opened_document_id()?
    .filter(|stored| stored != document_id)
    .or_else(|| documents.first().map(|document| document.id.clone()));

  if let Some(current_document_id) = current_document_id.as_deref() {
    repository.set_last_opened_document_id(current_document_id)?;
  }

  let current_document = current_document_id
    .as_deref()
    .map(|id| open_document(repository, id))
    .transpose()?;

  Ok(build_bootstrap_payload(settings, documents, trash_documents, current_document))
}

pub fn empty_trash(repository: &mut dyn AppRepository) -> Result<(), AppError> {
  repository.empty_trash()
}

pub fn restore_document_from_trash(
  repository: &mut dyn AppRepository,
  document_id: &str,
) -> Result<BootstrapPayload, AppError> {
  repository.restore_document_from_trash(document_id)?;
  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;

  let current_document_id = repository
    .get_last_opened_document_id()?
    .or_else(|| documents.first().map(|d| d.id.clone()));

  let current_document = current_document_id
    .as_deref()
    .map(|id| open_document(repository, id))
    .transpose()?;

  Ok(build_bootstrap_payload(settings, documents, trash_documents, current_document))
}

pub fn delete_all_documents(repository: &mut dyn AppRepository) -> Result<BootstrapPayload, AppError> {
  repository.delete_all_documents()?;
  repository.ensure_initial_document()?;

  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let current_document_id = documents
    .first()
    .map(|document| document.id.clone())
    .ok_or_else(|| AppError::validation("초기 문서를 만들지 못했습니다."))?;

  repository.set_last_opened_document_id(&current_document_id)?;
  let current_document = open_document(repository, &current_document_id)?;

  Ok(build_bootstrap_payload(settings, documents, vec![], Some(current_document)))
}

pub fn set_document_block_tint_override(
  repository: &mut dyn AppRepository,
  document_id: &str,
  block_tint_override: Option<BlockTintPreset>,
) -> Result<DocumentDto, AppError> {
  let document = repository.set_document_block_tint_override(document_id, block_tint_override)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn set_document_surface_tone_override(
  repository: &mut dyn AppRepository,
  document_id: &str,
  document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
) -> Result<DocumentDto, AppError> {
  let document = repository.set_document_surface_tone_override(
    document_id,
    document_surface_tone_override,
  )?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn search_documents(
  repository: &mut dyn AppRepository,
  query: &str,
) -> Result<Vec<SearchResultDto>, AppError> {
  Ok(
    repository
      .search_documents(query)?
      .into_iter()
      .map(SearchResultDto::from)
      .collect::<Vec<_>>(),
  )
}

pub fn flush_document(repository: &mut dyn AppRepository, document_id: &str) -> Result<i64, AppError> {
  repository.touch_document(document_id)
}
