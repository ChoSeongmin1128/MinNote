mod application;
mod commands;
mod domain;
mod error;
mod infrastructure;
mod ports;
mod state;
mod sync;
mod window_controls;

use std::fs;

use crate::ports::repositories::AppStateRepository;
use state::AppState;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use window_controls::{apply_window_preferences_with_settings, menu_bar_icon, register_saved_global_shortcut, show_main_window, toggle_main_window};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

pub(crate) const TRAY_ID: &str = "minnote-tray";

#[cfg(target_os = "macos")]
pub(crate) fn setup_activation_listener(app_handle: tauri::AppHandle) {
  use block2::RcBlock;
  use objc2_app_kit::NSApplicationDidBecomeActiveNotification;
  use objc2_foundation::{NSNotification, NSNotificationCenter};
  use std::ptr::NonNull;

  let observer = unsafe {
    let center = NSNotificationCenter::defaultCenter();
    let block = RcBlock::new(move |_notif: NonNull<NSNotification>| {
      if let Some(window) = app_handle.get_webview_window("main") {
        if !window.is_visible().unwrap_or(true) {
          let _ = show_main_window(&app_handle);
        }
      }
    });
    center.addObserverForName_object_queue_usingBlock(
      Some(NSApplicationDidBecomeActiveNotification),
      None,
      None,
      &*block,
    )
  };
  // 앱 생명주기 동안 observer 유지
  std::mem::forget(observer);
}

pub(crate) fn build_tray_icon(app: &tauri::AppHandle) -> tauri::Result<TrayIcon> {
  #[cfg(target_os = "macos")]
  let icon = menu_bar_icon();
  #[cfg(not(target_os = "macos"))]
  let icon = app.default_window_icon().cloned().expect("no app icon");

  let menu = MenuBuilder::new(app)
    .text("show", "열기")
    .text("settings", "설정...")
    .item(&PredefinedMenuItem::separator(app)?)
    .text("quit", "종료")
    .build()?;

  let builder = TrayIconBuilder::with_id(TRAY_ID)
    .icon(icon)
    .tooltip("MinNote")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button_state, .. } = event {
        if button_state == tauri::tray::MouseButtonState::Up {
          let app = tray.app_handle();
          let _ = toggle_main_window(app);
        }
      }
    })
    .on_menu_event(|app, event| {
      match event.id().as_ref() {
        "show" => {
          let _ = show_main_window(app);
        }
        "settings" => {
          if let Some(window) = app.get_webview_window("main") {
            let _ = show_main_window(app);
            let _ = window.emit("tray-open-settings", ());
          }
        }
        "quit" => app.exit(0),
        _ => {}
      }
    });

  builder.build(app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .setup(|app| {
      let app_dir = app.path().app_data_dir().expect("failed to resolve app data directory");
      fs::create_dir_all(&app_dir).expect("failed to create app data directory");

      let database_path = app_dir.join("minnote.sqlite3");
      let app_state = AppState::new(&database_path).expect("failed to initialize app state");

      let settings = app_state
        .repository
        .lock()
        .ok()
        .and_then(|repo| repo.get_app_settings().ok());

      let icloud_enabled = settings.as_ref().map(|s| s.icloud_sync_enabled).unwrap_or(false);
      let menu_bar_icon_enabled = settings.as_ref().map(|s| s.menu_bar_icon_enabled).unwrap_or(false);

      app.manage(app_state);

      if let Some(managed_state) = app.try_state::<AppState>() {
        if let Ok(settings) = managed_state
          .repository
          .lock()
          .map_err(|_| ())
          .and_then(|repository| repository.get_app_settings().map_err(|_| ()))
        {
          let _ = apply_window_preferences_with_settings(app.handle(), &settings);
        }
      }

      if icloud_enabled {
        if let Some(managed_state) = app.try_state::<AppState>() {
          let db_path = database_path.to_str().unwrap_or_default().to_string();
          let state_path = database_path
            .parent()
            .unwrap_or(&database_path)
            .join("sync-engine-state.json")
            .to_str()
            .unwrap_or_default()
            .to_string();

          let app_handle = app.handle().clone();
          if let Ok(mut sync) = managed_state.sync_manager.lock() {
            let _ = sync.start(&app_handle, &db_path, &state_path);
          }
        }
      }

      if menu_bar_icon_enabled && app.tray_by_id(TRAY_ID).is_none() {
        let _ = build_tray_icon(app.handle());
      }

      register_saved_global_shortcut(app.handle());

      #[cfg(target_os = "macos")]
      setup_activation_listener(app.handle().clone());

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let tray_enabled = window.app_handle().tray_by_id(TRAY_ID).is_some();
        if tray_enabled {
          let _ = window.app_handle().save_window_state(StateFlags::all());
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      commands::bootstrap_app,
      commands::get_window_control_runtime_state,
      commands::list_documents,
      commands::open_document,
      commands::create_document,
      commands::rename_document,
      commands::delete_document,
      commands::delete_all_documents,
      commands::search_documents,
      commands::create_block_below,
      commands::change_block_kind,
      commands::move_block,
      commands::delete_block,
      commands::update_markdown_block,
      commands::update_code_block,
      commands::update_text_block,
      commands::flush_document,
      commands::set_theme_mode,
      commands::set_default_block_tint_preset,
      commands::set_default_document_surface_tone_preset,
      commands::set_document_block_tint_override,
      commands::set_document_surface_tone_override,
      commands::restore_document_blocks,
      commands::empty_trash,
      commands::restore_document_from_trash,
      commands::set_icloud_sync_enabled,
      commands::set_menu_bar_icon_enabled,
      commands::set_default_block_kind,
      commands::set_always_on_top_enabled,
      commands::preview_window_opacity_percent,
      commands::set_window_opacity_percent,
      commands::set_global_toggle_shortcut,
      commands::apply_remote_documents,
    ])
    .build(tauri::generate_context!())
    .expect("error building tauri application")
    .run(|app, event| {
      match event {
        // Dock 아이콘 클릭 → 항상 창 복원
        tauri::RunEvent::Reopen { .. } => {
          let _ = show_main_window(app);
        }
        _ => {}
      }
    });
}
