use tauri::{AppHandle, State};

use crate::app_runtime::sync_menu_bar_icon_runtime_state;
use crate::application::services;
use crate::domain::models::AppSettings;
use crate::error::AppError;
use crate::infrastructure::sync_engine::SyncEngine;
use crate::ports::repositories::AppRepository;
use crate::state::{AppState, SyncTriggerReason};
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

pub(super) fn persist_window_setting<T>(
  state: State<'_, AppState>,
  app_handle: &tauri::AppHandle,
  callback: impl FnOnce(&mut dyn AppRepository) -> Result<T, AppError>,
  rollback: impl FnOnce(&mut dyn AppRepository, &AppSettings) -> Result<(), AppError>,
) -> Result<T, String> {
  let previous_settings = with_repository(state.clone(), |repository| repository.get_app_settings())?;
  let (result, settings) = with_repository_and_settings(state.clone(), callback)?;

  match apply_window_preferences_with_settings(app_handle, &settings) {
    Ok(()) => {
      state.set_window_preference_error(None);
      Ok(result)
    }
    Err(error) => {
      state.set_window_preference_error(Some(error.clone()));
      if let Err(rollback_error) = with_repository(state, |repository| {
        rollback(repository, &previous_settings)?;
        Ok(())
      }) {
        return Err(format!("{error} (창 설정을 롤백하지 못했습니다: {rollback_error})"));
      }

      if let Err(rollback_apply_error) = apply_window_preferences_with_settings(app_handle, &previous_settings) {
        return Err(format!("{error} (창 상태를 롤백하지 못했습니다: {rollback_apply_error})"));
      }

      Err(error)
    }
  }
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

  sync_menu_bar_icon_runtime_state(&state, app_handle, enabled)?;

  match with_repository(state.clone(), |repository| {
    services::set_menu_bar_icon_enabled(repository, enabled)
  }) {
    Ok(result) => Ok(result),
    Err(error) => {
      if let Err(rollback_error) = sync_menu_bar_icon_runtime_state(&state, app_handle, previous_enabled) {
        return Err(format!("{error} (메뉴바 아이콘 상태를 롤백하지 못했습니다: {rollback_error})"));
      }
      Err(error)
    }
  }
}

pub(super) fn schedule_sync_after_mutation(
  state: &State<'_, AppState>,
  app_handle: &AppHandle,
) {
  state.schedule_sync(SyncTriggerReason::StructuralMutation, false);
  SyncEngine::emit_current_status(app_handle, state.inner());
}

pub(super) fn emit_sync_status_after_mutation(
  state: &State<'_, AppState>,
  app_handle: &AppHandle,
) {
  SyncEngine::emit_current_status(app_handle, state.inner());
}
