use tauri::State;

use crate::application::dto::{
  BlockDto,
  BlockRestoreDto,
  BootstrapPayload,
  DocumentDto,
  DocumentSummaryDto,
  RemoteDocumentDto,
  SearchResultDto,
  WindowControlRuntimeStateDto,
};
use crate::application::services;
use crate::domain::models::{BlockKind, BlockTintPreset, DocumentSurfaceTonePreset, ThemeMode};
use crate::error::AppError;
use crate::ports::repositories::AppStateRepository;
use crate::state::AppState;
use crate::window_controls::{
  apply_window_preferences_with_settings,
  preview_window_opacity,
  update_global_shortcut_registration,
};
use crate::{TRAY_ID, build_tray_icon};

fn with_repository<T>(
  state: State<'_, AppState>,
  callback: impl FnOnce(&mut crate::infrastructure::sqlite::SqliteStore) -> Result<T, AppError>,
) -> Result<T, String> {
  let mut repository = state.repository.lock().map_err(|_| AppError::StateLock.to_string())?;
  callback(&mut repository).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bootstrap_app(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
  with_repository(state, services::bootstrap_app)
}

#[tauri::command]
pub fn get_window_control_runtime_state(
  state: State<'_, AppState>,
) -> Result<WindowControlRuntimeStateDto, String> {
  Ok(WindowControlRuntimeStateDto {
    global_shortcut_error: state.global_shortcut_error(),
  })
}

#[tauri::command]
pub fn list_documents(state: State<'_, AppState>) -> Result<Vec<DocumentSummaryDto>, String> {
  with_repository(state, services::list_documents)
}

#[tauri::command]
pub fn open_document(state: State<'_, AppState>, document_id: String) -> Result<DocumentDto, String> {
  with_repository(state, |repository| services::open_document(repository, &document_id))
}

#[tauri::command]
pub fn create_document(state: State<'_, AppState>) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), services::create_document)?;
  state.notify_sync_changed(&result.id);
  Ok(result)
}

#[tauri::command]
pub fn rename_document(
  state: State<'_, AppState>,
  document_id: String,
  title: Option<String>,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::rename_document(repository, &document_id, title)
  })?;
  state.notify_sync_changed(&result.id);
  Ok(result)
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, document_id: String) -> Result<BootstrapPayload, String> {
  let result = with_repository(state.clone(), |repository| {
    services::delete_document(repository, &document_id)
  })?;
  state.notify_sync_deleted(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn delete_all_documents(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
  let result = with_repository(state.clone(), services::delete_all_documents)?;
  state.notify_sync_reset();
  Ok(result)
}

#[tauri::command]
pub fn search_documents(state: State<'_, AppState>, query: String) -> Result<Vec<SearchResultDto>, String> {
  with_repository(state, |repository| services::search_documents(repository, &query))
}

#[tauri::command]
pub fn create_block_below(
  state: State<'_, AppState>,
  document_id: String,
  after_block_id: Option<String>,
  kind: BlockKind,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::create_block_below(repository, &document_id, after_block_id.as_deref(), kind)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn change_block_kind(
  state: State<'_, AppState>,
  block_id: String,
  kind: BlockKind,
) -> Result<BlockDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::change_block_kind(repository, &block_id, kind)
  })?;
  state.notify_sync_changed(&result.document_id);
  Ok(result)
}

#[tauri::command]
pub fn move_block(
  state: State<'_, AppState>,
  document_id: String,
  block_id: String,
  target_position: i64,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::move_block(repository, &document_id, &block_id, target_position)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn delete_block(state: State<'_, AppState>, block_id: String) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::delete_block(repository, &block_id)
  })?;
  state.notify_sync_changed(&result.id);
  Ok(result)
}

#[tauri::command]
pub fn update_markdown_block(
  state: State<'_, AppState>,
  block_id: String,
  content: String,
) -> Result<BlockDto, String> {
  with_repository(state, |repository| services::update_markdown_block(repository, &block_id, content))
}

#[tauri::command]
pub fn update_code_block(
  state: State<'_, AppState>,
  block_id: String,
  content: String,
  language: Option<String>,
) -> Result<BlockDto, String> {
  with_repository(state, |repository| services::update_code_block(repository, &block_id, content, language))
}

#[tauri::command]
pub fn update_text_block(
  state: State<'_, AppState>,
  block_id: String,
  content: String,
) -> Result<BlockDto, String> {
  with_repository(state, |repository| services::update_text_block(repository, &block_id, content))
}

#[tauri::command]
pub fn flush_document(state: State<'_, AppState>, document_id: String) -> Result<i64, String> {
  let result = with_repository(state.clone(), |repository| {
    services::flush_document(repository, &document_id)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

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
  let result = with_repository(state.clone(), |repository| {
    services::set_document_block_tint_override(repository, &document_id, block_tint_override)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn set_document_surface_tone_override(
  state: State<'_, AppState>,
  document_id: String,
  document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::set_document_surface_tone_override(
      repository,
      &document_id,
      document_surface_tone_override,
    )
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn restore_document_blocks(
  state: State<'_, AppState>,
  document_id: String,
  blocks: Vec<BlockRestoreDto>,
) -> Result<DocumentDto, String> {
  let result = with_repository(state.clone(), |repository| {
    services::restore_document_blocks(repository, &document_id, blocks)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
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
  let result = with_repository(state.clone(), |repository| {
    services::restore_document_from_trash(repository, &document_id)
  })?;
  state.notify_sync_changed(&document_id);
  Ok(result)
}

#[tauri::command]
pub fn set_icloud_sync_enabled(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  enabled: bool,
) -> Result<bool, String> {
  with_repository(state.clone(), |repository| {
    services::set_icloud_sync_enabled(repository, enabled)
  })?;

  let mut sync = state
    .sync_manager
    .lock()
    .map_err(|_| "sync manager lock failed".to_string())?;

  if enabled {
    let db_path = state.db_path.to_str().unwrap_or_default().to_string();
    let state_path = state.sync_state_path.to_str().unwrap_or_default().to_string();
    sync.start(&app_handle, &db_path, &state_path)?;
  } else {
    sync.stop();
  }

  Ok(enabled)
}

#[tauri::command]
pub fn refresh_icloud_sync(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
) -> Result<bool, String> {
  let settings = with_repository(state.clone(), |repository| repository.get_app_settings())?;
  if !settings.icloud_sync_enabled {
    return Ok(false);
  }

  let db_path = state.db_path.to_str().unwrap_or_default().to_string();
  let state_path = state.sync_state_path.to_str().unwrap_or_default().to_string();
  let mut sync = state
    .sync_manager
    .lock()
    .map_err(|_| "sync manager lock failed".to_string())?;

  sync.refresh(&app_handle, &db_path, &state_path)?;
  Ok(true)
}

#[tauri::command]
pub fn confirm_app_shutdown(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
) -> Result<(), String> {
  state.set_shutdown_confirmed(true);
  app_handle.exit(0);
  Ok(())
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
  with_repository(state.clone(), |repository| {
    services::set_menu_bar_icon_enabled(repository, enabled)
  })?;

  if enabled {
    if app_handle.tray_by_id(TRAY_ID).is_none() {
      build_tray_icon(&app_handle).map_err(|e| e.to_string())?;
    }
  } else {
    let _ = app_handle.remove_tray_by_id(TRAY_ID);
  }

  Ok(enabled)
}

#[tauri::command]
pub fn set_always_on_top_enabled(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  enabled: bool,
) -> Result<bool, String> {
  let settings = with_repository(state.clone(), |repository| {
    services::set_always_on_top_enabled(repository, enabled)?;
    repository.get_app_settings()
  })?;

  apply_window_preferences_with_settings(&app_handle, &settings)?;
  Ok(enabled)
}

#[tauri::command]
pub fn set_window_opacity_percent(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  percent: u8,
) -> Result<u8, String> {
  let settings = with_repository(state.clone(), |repository| {
    services::set_window_opacity_percent(repository, percent)?;
    repository.get_app_settings()
  })?;

  apply_window_preferences_with_settings(&app_handle, &settings)?;
  Ok(settings.window_opacity_percent)
}

#[tauri::command]
pub fn preview_window_opacity_percent(
  app_handle: tauri::AppHandle,
  percent: u8,
) -> Result<u8, String> {
  preview_window_opacity(&app_handle, percent)
}

#[tauri::command]
pub fn set_global_toggle_shortcut(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  shortcut: Option<String>,
) -> Result<Option<String>, String> {
  let previous_shortcut = state.active_global_toggle_shortcut();
  let registered_shortcut = update_global_shortcut_registration(&app_handle, shortcut.clone())?;

  match with_repository(state.clone(), |repository| {
    services::set_global_toggle_shortcut(repository, registered_shortcut.clone())
  }) {
    Ok(result) => {
      state.set_global_shortcut_error(None);
      Ok(result)
    }
    Err(error) => {
      let _ = update_global_shortcut_registration(&app_handle, previous_shortcut);
      Err(error)
    }
  }
}

#[tauri::command]
pub fn apply_remote_documents(
  state: State<'_, AppState>,
  documents: Vec<RemoteDocumentDto>,
) -> Result<BootstrapPayload, String> {
  let payload = with_repository(state.clone(), |repository| {
    services::apply_remote_documents(repository, documents)
  })?;
  Ok(payload)
}
