use tauri::State;

use crate::application::dto::{BootstrapPayload, DocumentDto, DocumentSummaryDto, SearchResultDto};
use crate::application::services;
use crate::error::AppError;
use crate::infrastructure::sync_engine::decorate_status;
use crate::state::AppState;

use super::helpers::with_repository;

#[tauri::command]
pub fn bootstrap_app(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let mut payload = services::bootstrap_app(&mut *repository).map_err(|error| error.to_string())?;
  payload.global_shortcut_error = state.global_shortcut_error();
  payload.menu_bar_icon_error = state.menu_bar_icon_error();
  payload.window_preference_error = state.window_preference_error();
  payload.icloud_sync_status = repository
    .get_icloud_sync_status()
    .map_err(|error| error.to_string())?;
  payload.icloud_sync_status = decorate_status(&state, payload.icloud_sync_status.clone());
  Ok(payload)
}

#[tauri::command]
pub fn list_documents(state: State<'_, AppState>) -> Result<Vec<DocumentSummaryDto>, String> {
  with_repository(state, services::list_documents)
}

#[tauri::command]
pub fn open_document(
  state: State<'_, AppState>,
  document_id: String,
) -> Result<DocumentDto, String> {
  with_repository(state, |repository| {
    services::open_document(repository, &document_id)
  })
}

#[tauri::command]
pub fn create_document(state: State<'_, AppState>) -> Result<DocumentDto, String> {
  with_repository(state, services::create_document)
}

#[tauri::command]
pub fn rename_document(
  state: State<'_, AppState>,
  document_id: String,
  title: Option<String>,
) -> Result<DocumentDto, String> {
  with_repository(state, |repository| {
    services::rename_document(repository, &document_id, title)
  })
}

#[tauri::command]
pub fn delete_document(
  state: State<'_, AppState>,
  document_id: String,
) -> Result<BootstrapPayload, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let mut payload =
    services::delete_document(&mut *repository, &document_id).map_err(|error| error.to_string())?;
  payload.icloud_sync_status = repository
    .get_icloud_sync_status()
    .map_err(|error| error.to_string())?;
  payload.icloud_sync_status = decorate_status(&state, payload.icloud_sync_status.clone());
  Ok(payload)
}

#[tauri::command]
pub fn delete_all_documents(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let mut payload =
    services::delete_all_documents(&mut *repository).map_err(|error| error.to_string())?;
  payload.icloud_sync_status = repository
    .get_icloud_sync_status()
    .map_err(|error| error.to_string())?;
  payload.icloud_sync_status = decorate_status(&state, payload.icloud_sync_status.clone());
  Ok(payload)
}

#[tauri::command]
pub fn search_documents(
  state: State<'_, AppState>,
  query: String,
) -> Result<Vec<SearchResultDto>, String> {
  with_repository(state, |repository| {
    services::search_documents(repository, &query)
  })
}

#[tauri::command]
pub fn flush_document(state: State<'_, AppState>, document_id: String) -> Result<i64, String> {
  with_repository(state, |repository| {
    services::flush_document(repository, &document_id)
  })
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> Result<(), String> {
  with_repository(state, services::empty_trash)
}

#[tauri::command]
pub fn restore_document_from_trash(
  state: State<'_, AppState>,
  document_id: String,
) -> Result<BootstrapPayload, String> {
  let mut repository = state
    .repository
    .lock()
    .map_err(|_| AppError::StateLock.to_string())?;
  let mut payload = services::restore_document_from_trash(&mut *repository, &document_id)
    .map_err(|error| error.to_string())?;
  payload.icloud_sync_status = repository
    .get_icloud_sync_status()
    .map_err(|error| error.to_string())?;
  payload.icloud_sync_status = decorate_status(&state, payload.icloud_sync_status.clone());
  Ok(payload)
}
