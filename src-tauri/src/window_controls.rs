use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::domain::models::AppSettings;
use crate::ports::repositories::AppStateRepository;
use crate::state::AppState;

pub const MIN_WINDOW_OPACITY_PERCENT: u8 = 50;
pub const MAX_WINDOW_OPACITY_PERCENT: u8 = 100;

pub fn show_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  apply_window_preferences(app)?;

  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
  Ok(())
}

pub fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  let is_visible = window.is_visible().map_err(|error| error.to_string())?;
  let is_minimized = window.is_minimized().map_err(|error| error.to_string())?;

  if is_visible && !is_minimized {
    window.hide().map_err(|error| error.to_string())?;
    return Ok(());
  }

  show_main_window(app)
}

pub fn apply_window_preferences(app: &AppHandle) -> Result<(), String> {
  let state = app.state::<AppState>();
  let settings = state
    .repository
    .lock()
    .map_err(|_| "설정 저장소를 잠글 수 없습니다.".to_string())?
    .get_app_settings()
    .map_err(|error| error.to_string())?;

  apply_window_preferences_with_settings(app, &settings)
}

pub fn apply_window_preferences_with_settings(
  app: &AppHandle,
  settings: &AppSettings,
) -> Result<(), String> {
  let window = main_window(app)?;
  window
    .set_always_on_top(settings.always_on_top_enabled)
    .map_err(|error| error.to_string())?;
  apply_window_opacity(&window, settings.window_opacity_percent)?;
  Ok(())
}

pub fn register_saved_global_shortcut(app: &AppHandle) {
  let state = app.state::<AppState>();
  let settings = match state.repository.lock() {
    Ok(repository) => match repository.get_app_settings() {
      Ok(settings) => settings,
      Err(error) => {
        state.set_global_shortcut_error(Some(error.to_string()));
        return;
      }
    },
    Err(_) => {
      state.set_global_shortcut_error(Some("설정 저장소를 잠글 수 없습니다.".to_string()));
      return;
    }
  };

  if let Err(error) = update_global_shortcut_registration(app, settings.global_toggle_shortcut.clone()) {
    state.set_global_shortcut_error(Some(error));
  } else {
    state.set_global_shortcut_error(None);
  }
}

pub fn update_global_shortcut_registration(
  app: &AppHandle,
  next_shortcut: Option<String>,
) -> Result<Option<String>, String> {
  let state = app.state::<AppState>();
  let current_shortcut = state.active_global_toggle_shortcut();
  let normalized_next = next_shortcut
    .map(|shortcut| shortcut.trim().to_string())
    .filter(|shortcut| !shortcut.is_empty());

  let registrar = TauriShortcutRegistrar { app };
  let next_active_shortcut = replace_shortcut_registration(
    &registrar,
    current_shortcut.as_deref(),
    normalized_next.as_deref(),
  )?;

  state.set_active_global_toggle_shortcut(next_active_shortcut.clone());
  state.set_global_shortcut_error(None);

  Ok(next_active_shortcut)
}

pub fn preview_window_opacity(app: &AppHandle, percent: u8) -> Result<u8, String> {
  let window = main_window(app)?;
  let percent = percent.clamp(MIN_WINDOW_OPACITY_PERCENT, MAX_WINDOW_OPACITY_PERCENT);
  apply_window_opacity(&window, percent)?;
  Ok(percent)
}

trait ShortcutRegistrar {
  fn register(&self, shortcut: &str) -> Result<(), String>;
  fn unregister(&self, shortcut: &str) -> Result<(), String>;
}

struct TauriShortcutRegistrar<'a> {
  app: &'a AppHandle,
}

impl ShortcutRegistrar for TauriShortcutRegistrar<'_> {
  fn register(&self, shortcut: &str) -> Result<(), String> {
    self
      .app
      .global_shortcut()
      .on_shortcut(shortcut, |app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
          let _ = toggle_main_window(app);
        }
      })
      .map_err(|error| format!("전역 단축키를 등록하지 못했습니다: {error}"))
  }

  fn unregister(&self, shortcut: &str) -> Result<(), String> {
    self
      .app
      .global_shortcut()
      .unregister(shortcut)
      .map_err(|error| format!("기존 전역 단축키를 해제하지 못했습니다: {error}"))
  }
}

fn replace_shortcut_registration(
  registrar: &impl ShortcutRegistrar,
  current_shortcut: Option<&str>,
  next_shortcut: Option<&str>,
) -> Result<Option<String>, String> {
  if current_shortcut == next_shortcut {
    return Ok(next_shortcut.map(ToOwned::to_owned));
  }

  match (current_shortcut, next_shortcut) {
    (None, None) => Ok(None),
    (Some(current), None) => {
      registrar.unregister(current)?;
      Ok(None)
    }
    (None, Some(next)) => {
      registrar.register(next)?;
      Ok(Some(next.to_string()))
    }
    (Some(current), Some(next)) => {
      registrar.register(next)?;

      if let Err(error) = registrar.unregister(current) {
        let rollback_error = registrar.unregister(next).err();
        if let Some(rollback_error) = rollback_error {
          return Err(format!("{error} (롤백 실패: {rollback_error})"));
        }

        return Err(error);
      }

      Ok(Some(next.to_string()))
    }
  }
}

#[cfg(test)]
mod tests {
  use super::replace_shortcut_registration;
  use std::cell::RefCell;

  #[derive(Default)]
  struct MockShortcutRegistrar {
    log: RefCell<Vec<String>>,
    fail_register: Option<String>,
    fail_unregister: Option<String>,
  }

  impl super::ShortcutRegistrar for MockShortcutRegistrar {
    fn register(&self, shortcut: &str) -> Result<(), String> {
      self.log.borrow_mut().push(format!("register:{shortcut}"));
      if self.fail_register.as_deref() == Some(shortcut) {
        return Err(format!("전역 단축키를 등록하지 못했습니다: {shortcut}"));
      }
      Ok(())
    }

    fn unregister(&self, shortcut: &str) -> Result<(), String> {
      self.log.borrow_mut().push(format!("unregister:{shortcut}"));
      if self.fail_unregister.as_deref() == Some(shortcut) {
        return Err(format!("기존 전역 단축키를 해제하지 못했습니다: {shortcut}"));
      }
      Ok(())
    }
  }

  #[test]
  fn keeps_current_shortcut_when_registering_next_fails() {
    let registrar = MockShortcutRegistrar {
      fail_register: Some("Cmd+Shift+K".to_string()),
      ..Default::default()
    };

    let result = replace_shortcut_registration(
      &registrar,
      Some("Cmd+Shift+Space"),
      Some("Cmd+Shift+K"),
    );

    assert!(result.is_err());
    assert_eq!(registrar.log.borrow().as_slice(), ["register:Cmd+Shift+K"]);
  }

  #[test]
  fn rolls_back_next_shortcut_when_unregistering_current_fails() {
    let registrar = MockShortcutRegistrar {
      fail_unregister: Some("Cmd+Shift+Space".to_string()),
      ..Default::default()
    };

    let result = replace_shortcut_registration(
      &registrar,
      Some("Cmd+Shift+Space"),
      Some("Cmd+Shift+K"),
    );

    assert!(result.is_err());
    assert_eq!(
      registrar.log.borrow().as_slice(),
      [
        "register:Cmd+Shift+K",
        "unregister:Cmd+Shift+Space",
        "unregister:Cmd+Shift+K",
      ],
    );
  }

  #[test]
  fn unregisters_current_shortcut_when_disabling() {
    let registrar = MockShortcutRegistrar::default();

    let result = replace_shortcut_registration(&registrar, Some("Cmd+Shift+Space"), None)
      .expect("disable should succeed");

    assert_eq!(result, None);
    assert_eq!(registrar.log.borrow().as_slice(), ["unregister:Cmd+Shift+Space"]);
  }
}

#[cfg(target_os = "macos")]
pub fn menu_bar_icon() -> tauri::image::Image<'static> {
  use image::ImageFormat;
  use image::ImageReader;

  let cursor = std::io::Cursor::new(include_bytes!("../icons/menu-bar-symbol-colored.png"));
  let image = ImageReader::with_format(cursor, ImageFormat::Png)
    .decode()
    .expect("menu bar icon asset should be a valid png")
    .into_rgba8();
  let (width, height) = image.dimensions();

  tauri::image::Image::new_owned(image.into_raw(), width, height)
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
  app
    .get_webview_window("main")
    .ok_or_else(|| "메인 창을 찾을 수 없습니다.".to_string())
}

#[cfg(target_os = "macos")]
fn apply_window_opacity(window: &WebviewWindow, percent: u8) -> Result<(), String> {
  use objc2_app_kit::NSWindow;

  let percent = percent.clamp(MIN_WINDOW_OPACITY_PERCENT, MAX_WINDOW_OPACITY_PERCENT);
  let ns_window_ptr = window.ns_window().map_err(|error| error.to_string())?;
  let ns_window = unsafe { (ns_window_ptr as *mut NSWindow).as_ref() }
    .ok_or_else(|| "macOS 창 핸들을 찾을 수 없습니다.".to_string())?;

  ns_window.setAlphaValue((percent as f64 / 100.0) as _);

  Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_window_opacity(_window: &WebviewWindow, _percent: u8) -> Result<(), String> {
  Ok(())
}
