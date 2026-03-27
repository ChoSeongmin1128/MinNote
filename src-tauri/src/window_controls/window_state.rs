use tauri::{AppHandle, Manager, WebviewWindow};

use crate::domain::models::AppSettings;
use crate::ports::repositories::AppStateRepository;
use crate::state::AppState;

use super::{MAX_WINDOW_OPACITY_PERCENT, MIN_WINDOW_OPACITY_PERCENT};

pub(crate) fn show_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  apply_window_preferences(app)?;

  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
  Ok(())
}

pub(crate) fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  let is_visible = window.is_visible().map_err(|error| error.to_string())?;
  let is_minimized = window.is_minimized().map_err(|error| error.to_string())?;

  if is_visible && !is_minimized {
    window.hide().map_err(|error| error.to_string())?;
    return Ok(());
  }

  show_main_window(app)
}

pub(crate) fn apply_window_preferences(app: &AppHandle) -> Result<(), String> {
  let state = app.state::<AppState>();
  let settings = state
    .repository
    .lock()
    .map_err(|_| "설정 저장소를 잠글 수 없습니다.".to_string())?
    .get_app_settings()
    .map_err(|error| error.to_string())?;

  apply_window_preferences_with_settings(app, &settings)
}

pub(crate) fn apply_window_preferences_with_settings(
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

pub(crate) fn preview_window_opacity(app: &AppHandle, percent: u8) -> Result<u8, String> {
  let window = main_window(app)?;
  let percent = percent.clamp(MIN_WINDOW_OPACITY_PERCENT, MAX_WINDOW_OPACITY_PERCENT);
  apply_window_opacity(&window, percent)?;
  Ok(percent)
}

#[cfg(target_os = "macos")]
pub(crate) fn menu_bar_icon() -> Result<tauri::image::Image<'static>, String> {
  use image::ImageFormat;
  use image::ImageReader;

  let cursor = std::io::Cursor::new(include_bytes!("../../icons/menu-bar-symbol-colored.png"));
  let image = ImageReader::with_format(cursor, ImageFormat::Png)
    .decode()
    .map_err(|error| format!("메뉴바 아이콘 리소스를 읽지 못했습니다: {error}"))?
    .into_rgba8();
  let (width, height) = image.dimensions();

  Ok(tauri::image::Image::new_owned(image.into_raw(), width, height))
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
