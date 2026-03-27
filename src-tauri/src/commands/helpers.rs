use tauri::State;

use crate::app_runtime::sync_tray_icon_enabled;
use crate::application::services;
use crate::domain::models::AppSettings;
use crate::error::AppError;
use crate::ports::repositories::AppRepository;
use crate::state::AppState;
use crate::window_controls::{apply_window_preferences_with_settings, update_global_shortcut_registration};

pub(super) fn with_repository<T>(
  state: State<'_, AppState>,
  callback: impl FnOnce(&mut dyn AppRepository) -> Result<T, AppError>,
) -> Result<T, String> {
  let mut repository = state.repository.lock().map_err(|_| AppError::StateLock.to_string())?;
  callback(&mut *repository).map_err(|error| error.to_string())
}

pub(super) fn with_repository_and_settings<T>(
  state: State<'_, AppState>,
  callback: impl FnOnce(&mut dyn AppRepository) -> Result<T, AppError>,
) -> Result<(T, AppSettings), String> {
  with_repository(state, |repository| {
    let result = callback(repository)?;
    let settings = repository.get_app_settings()?;
    Ok((result, settings))
  })
}

fn sync_tray_icon_runtime(
  state: &AppState,
  app_handle: &tauri::AppHandle,
  enabled: bool,
) -> Result<(), String> {
  match sync_tray_icon_enabled(app_handle, enabled) {
    Ok(()) => {
      state.set_menu_bar_icon_error(None);
      Ok(())
    }
    Err(error) => {
      state.set_menu_bar_icon_error(Some(error.clone()));
      Err(error)
    }
  }
}

pub(super) fn persist_window_setting<T>(
  state: State<'_, AppState>,
  app_handle: &tauri::AppHandle,
  callback: impl FnOnce(&mut dyn AppRepository) -> Result<T, AppError>,
) -> Result<T, String> {
  let (result, settings) = with_repository_and_settings(state, callback)?;
  apply_window_preferences_with_settings(app_handle, &settings)?;
  Ok(result)
}

pub(super) fn persist_global_shortcut(
  state: State<'_, AppState>,
  app_handle: &tauri::AppHandle,
  shortcut: Option<String>,
) -> Result<Option<String>, String> {
  let previous_shortcut = state.active_global_toggle_shortcut();
  let registered_shortcut = update_global_shortcut_registration(app_handle, shortcut.clone())?;

  match with_repository(state.clone(), |repository| {
    services::set_global_toggle_shortcut(repository, registered_shortcut.clone())
  }) {
    Ok(result) => {
      state.set_global_shortcut_error(None);
      Ok(result)
    }
    Err(error) => {
      let _ = update_global_shortcut_registration(app_handle, previous_shortcut);
      Err(error)
    }
  }
}

pub(super) fn persist_menu_bar_icon_setting(
  state: State<'_, AppState>,
  app_handle: &tauri::AppHandle,
  enabled: bool,
) -> Result<bool, String> {
  let previous_enabled = with_repository(state.clone(), |repository| {
    Ok(repository.get_app_settings()?.menu_bar_icon_enabled)
  })?;

  sync_tray_icon_runtime(&state, app_handle, enabled)?;

  match with_repository(state.clone(), |repository| {
    services::set_menu_bar_icon_enabled(repository, enabled)
  }) {
    Ok(result) => Ok(result),
    Err(error) => {
      if let Err(rollback_error) = sync_tray_icon_runtime(&state, app_handle, previous_enabled) {
        return Err(format!("{error} (메뉴바 아이콘 상태를 롤백하지 못했습니다: {rollback_error})"));
      }
      Err(error)
    }
  }
}
