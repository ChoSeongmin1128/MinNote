use tauri::{AppHandle, State};

use crate::application::dto::{BlockDto, BlockRestoreDto, DocumentDto};
use crate::application::services;
use crate::domain::models::BlockKind;
use crate::state::AppState;

use super::helpers::{emit_sync_status_after_mutation, schedule_sync_after_mutation, with_repository};

#[tauri::command]
pub fn create_block_below(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  document_id: String,
  after_block_id: Option<String>,
  kind: BlockKind,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::create_block_below(repository, &document_id, after_block_id.as_deref(), kind)
  })?;
  schedule_sync_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn change_block_kind(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  block_id: String,
  kind: BlockKind,
) -> Result<BlockDto, String> {
  let result =
    with_repository(state.clone(), |repository| services::change_block_kind(repository, &block_id, kind))?;
  schedule_sync_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn move_block(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  document_id: String,
  block_id: String,
  target_position: i64,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::move_block(repository, &document_id, &block_id, target_position)
  })?;
  schedule_sync_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn delete_block(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  block_id: String,
) -> Result<DocumentDto, String> {
  let result =
    with_repository(state.clone(), |repository| services::delete_block(repository, &block_id))?;
  schedule_sync_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn update_markdown_block(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  block_id: String,
  content: String,
) -> Result<BlockDto, String> {
  let result =
    with_repository(state.clone(), |repository| services::update_markdown_block(repository, &block_id, content))?;
  emit_sync_status_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn update_code_block(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  block_id: String,
  content: String,
  language: Option<String>,
) -> Result<BlockDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::update_code_block(repository, &block_id, content, language)
  })?;
  emit_sync_status_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn update_text_block(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  block_id: String,
  content: String,
) -> Result<BlockDto, String> {
  let result =
    with_repository(state.clone(), |repository| services::update_text_block(repository, &block_id, content))?;
  emit_sync_status_after_mutation(&state, &app_handle);
  Ok(result)
}

#[tauri::command]
pub fn restore_document_blocks(
  app_handle: AppHandle,
  state: State<'_, AppState>,
  document_id: String,
  blocks: Vec<BlockRestoreDto>,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::restore_document_blocks(repository, &document_id, blocks)
  })?;
  schedule_sync_after_mutation(&state, &app_handle);
  Ok(result)
}
