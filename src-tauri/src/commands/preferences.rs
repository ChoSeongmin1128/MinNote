use tauri::State;

use crate::application::dto::DocumentDto;
use crate::application::services;
use crate::domain::models::{BlockKind, BlockTintPreset, DocumentSurfaceTonePreset, ThemeMode};
use crate::state::AppState;

use super::helpers::{
  persist_global_shortcut,
  persist_menu_bar_icon_setting,
  persist_window_setting,
  with_repository,
};

#[tauri::command]
pub fn set_theme_mode(state: State<'_, AppState>, theme_mode: ThemeMode) -> Result<ThemeMode, String> {
  with_repository(state, |repository| services::set_theme_mode(repository, theme_mode))
}

#[tauri::command]
pub fn set_default_block_tint_preset(
  state: State<'_, AppState>,
  preset: BlockTintPreset,
) -> Result<BlockTintPreset, String> {
  with_repository(state, |repository| services::set_default_block_tint_preset(repository, preset))
}

#[tauri::command]
pub fn set_default_document_surface_tone_preset(
  state: State<'_, AppState>,
  preset: DocumentSurfaceTonePreset,
) -> Result<DocumentSurfaceTonePreset, String> {
  with_repository(state, |repository| {
    services::set_default_document_surface_tone_preset(repository, preset)
  })
}

#[tauri::command]
pub fn set_document_block_tint_override(
  state: State<'_, AppState>,
  document_id: String,
  block_tint_override: Option<BlockTintPreset>,
) -> Result<DocumentDto, String> {
  with_repository(state, |repository| {
    services::set_document_block_tint_override(repository, &document_id, block_tint_override)
  })
}

#[tauri::command]
pub fn set_document_surface_tone_override(
  state: State<'_, AppState>,
  document_id: String,
  document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
) -> Result<DocumentDto, String> {
  with_repository(state, |repository| {
    services::set_document_surface_tone_override(
      repository,
      &document_id,
      document_surface_tone_override,
    )
  })
}

#[tauri::command]
pub fn set_default_block_kind(
  state: State<'_, AppState>,
  kind: BlockKind,
) -> Result<BlockKind, String> {
  with_repository(state, |repository| services::set_default_block_kind(repository, kind))
}

#[tauri::command]
pub fn set_menu_bar_icon_enabled(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  enabled: bool,
) -> Result<bool, String> {
  persist_menu_bar_icon_setting(state, &app_handle, enabled)
}

#[tauri::command]
pub fn set_always_on_top_enabled(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  enabled: bool,
) -> Result<bool, String> {
  persist_window_setting(state, &app_handle, |repository| {
    services::set_always_on_top_enabled(repository, enabled)
  })
}

#[tauri::command]
pub fn set_window_opacity_percent(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  percent: u8,
) -> Result<u8, String> {
  persist_window_setting(state, &app_handle, |repository| {
    services::set_window_opacity_percent(repository, percent)
  })
}

#[tauri::command]
pub fn set_global_toggle_shortcut(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  shortcut: Option<String>,
) -> Result<Option<String>, String> {
  persist_global_shortcut(state, &app_handle, shortcut)
}
