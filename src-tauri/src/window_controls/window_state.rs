use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::domain::models::AppSettings;
use crate::ports::repositories::AppStateRepository;
use crate::state::AppState;

use super::{MAX_WINDOW_OPACITY_PERCENT, MIN_WINDOW_OPACITY_PERCENT};

pub(crate) fn show_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  apply_window_preferences(app)?;
  ensure_window_visible_on_screen(&window)?;

  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
  Ok(())
}

pub(crate) fn ensure_main_window_visible_on_screen(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  ensure_window_visible_on_screen(&window)
}

pub(crate) fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
  let window = main_window(app)?;
  let is_visible = window.is_visible().map_err(|error| error.to_string())?;
  let is_minimized = window.is_minimized().map_err(|error| error.to_string())?;
  let is_focused = window.is_focused().map_err(|error| error.to_string())?;
  let settings = app
    .state::<AppState>()
    .repository
    .lock()
    .map_err(|_| "설정 저장소를 잠글 수 없습니다.".to_string())?
    .get_app_settings()
    .map_err(|error| error.to_string())?;

  let should_hide_when_visible = is_focused || settings.always_on_top_enabled;

  if is_visible && !is_minimized && should_hide_when_visible {
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

fn ensure_window_visible_on_screen(window: &WebviewWindow) -> Result<(), String> {
  let position = window.outer_position().map_err(|error| error.to_string())?;
  let monitors = window
    .available_monitors()
    .map_err(|error| error.to_string())?;

  if monitors.is_empty() || window_title_anchor_is_visible(position, &monitors) {
    return Ok(());
  }

  recenter_window_on_preferred_display(window)
}

fn recenter_window_on_preferred_display(window: &WebviewWindow) -> Result<(), String> {
  let position = window.outer_position().map_err(|error| error.to_string())?;
  let size = window.outer_size().map_err(|error| error.to_string())?;
  let monitors = window
    .available_monitors()
    .map_err(|error| error.to_string())?;
  let monitor = monitor_containing_origin(&monitors).or_else(|| {
    window
      .primary_monitor()
      .ok()
      .flatten()
      .or_else(|| monitors.first().cloned())
  });
  let Some(monitor) = monitor else {
    return Ok(());
  };

  let work_area = monitor.work_area();
  let work_position = work_area.position;
  let work_size = work_area.size;
  let margin = 24_i32;
  let max_width = (work_size.width as i32 - margin * 2).max(640) as u32;
  let max_height = (work_size.height as i32 - margin * 2).max(480) as u32;
  let target_size = PhysicalSize {
    width: size.width.min(max_width),
    height: size.height.min(max_height),
  };

  if target_size != size {
    window
      .set_size(target_size)
      .map_err(|error| error.to_string())?;
  }

  let target_x =
    work_position.x + ((work_size.width as i32 - target_size.width as i32) / 2).max(margin);
  let target_y =
    work_position.y + ((work_size.height as i32 - target_size.height as i32) / 2).max(margin);

  log::warn!(
    "창 위치가 현재 화면 밖에 있어 기본 표시 영역으로 이동합니다: ({}, {}) -> ({}, {})",
    position.x,
    position.y,
    target_x,
    target_y
  );

  window
    .set_position(PhysicalPosition {
      x: target_x,
      y: target_y,
    })
    .map_err(|error| error.to_string())
}

fn window_title_anchor_is_visible(
  position: PhysicalPosition<i32>,
  monitors: &[tauri::Monitor],
) -> bool {
  let anchor_x = position.x + 80;
  let anchor_y = position.y + 24;

  monitors.iter().any(|monitor| {
    let work_area = monitor.work_area();
    let left = work_area.position.x;
    let top = work_area.position.y;
    let right = left + work_area.size.width as i32;
    let bottom = top + work_area.size.height as i32;

    anchor_x >= left && anchor_x < right && anchor_y >= top && anchor_y < bottom
  })
}

fn monitor_containing_origin(monitors: &[tauri::Monitor]) -> Option<tauri::Monitor> {
  monitors
    .iter()
    .find(|monitor| {
      let work_area = monitor.work_area();
      let left = work_area.position.x;
      let top = work_area.position.y;
      let right = left + work_area.size.width as i32;
      let bottom = top + work_area.size.height as i32;

      0 >= left && 0 < right && 0 >= top && 0 < bottom
    })
    .cloned()
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
