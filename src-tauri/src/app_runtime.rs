use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::models::AppSettings;
use crate::error::AppError;
use crate::error::StartupError;
use crate::infrastructure::sync_engine::SyncEngine;
use crate::ports::repositories::AppStateRepository;
use crate::state::{AppState, SyncRuntimePhase};
use crate::window_controls::{
    apply_window_preferences_with_settings, menu_bar_icon, register_saved_global_shortcut,
    show_main_window, toggle_main_window,
};
use tauri::menu::{MenuBuilder, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

pub(crate) const TRAY_ID: &str = "minnote-tray";
const APP_SHUTDOWN_REQUESTED_EVENT: &str = "app-shutdown-requested";
const OPEN_SETTINGS_ON_START_ENV: &str = "MINNOTE_OPEN_SETTINGS_ON_START";
const RUN_ICLOUD_SYNC_ON_START_ENV: &str = "MINNOTE_RUN_ICLOUD_SYNC_ON_START";
const SMOKE_RESULT_PATH_ENV: &str = "MINNOTE_SMOKE_STATUS_PATH";
const OPEN_SETTINGS_ON_START_ARG: &str = "--smoke-open-settings";
const RUN_ICLOUD_SYNC_ON_START_ARG: &str = "--smoke-run-icloud-sync";
const SMOKE_RESULT_PATH_ARG: &str = "--smoke-result-path";

pub(crate) fn emit_shutdown_request(app_handle: &tauri::AppHandle) {
    let _ = app_handle.emit(APP_SHUTDOWN_REQUESTED_EVENT, ());
}

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
                match window.is_visible() {
                    Ok(is_visible) => {
                        if !is_visible {
                            let _ = show_main_window(&app_handle);
                        }
                    }
                    Err(error) => {
                        log::warn!("앱 활성화 시 창 표시 상태를 확인하지 못했습니다: {error}");
                        let _ = show_main_window(&app_handle);
                    }
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
    std::mem::forget(observer);
}

pub(crate) fn build_tray_icon(app: &tauri::AppHandle) -> tauri::Result<TrayIcon> {
    #[cfg(target_os = "macos")]
    let icon = menu_bar_icon().map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
    #[cfg(not(target_os = "macos"))]
    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        tauri::Error::Anyhow(anyhow::anyhow!("기본 앱 아이콘을 찾을 수 없습니다."))
    })?;

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
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_main_window(app);
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = show_main_window(app);
                    let _ = window.emit("tray-open-settings", ());
                }
            }
            "quit" => emit_shutdown_request(app),
            _ => {}
        });

    builder.build(app)
}

fn env_flag(name: &str) -> bool {
    matches!(
        std::env::var(name).ok().as_deref(),
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES")
    )
}

fn has_arg(flag: &str) -> bool {
    std::env::args().any(|arg| arg == flag)
}

fn arg_value(flag: &str) -> Option<String> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == flag {
            return args.next();
        }
    }
    None
}

fn smoke_result_path() -> std::path::PathBuf {
    if let Some(value) = arg_value(SMOKE_RESULT_PATH_ARG) {
        return std::path::PathBuf::from(value);
    }
    std::env::var_os(SMOKE_RESULT_PATH_ENV)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("minnote-icloud-smoke.json"))
}

fn write_smoke_result(value: serde_json::Value) {
    let path = smoke_result_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, serde_json::to_vec_pretty(&value).unwrap_or_default());
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn run_icloud_startup_smoke(app_handle: &tauri::AppHandle) {
    let Some(state) = app_handle.try_state::<AppState>() else {
        write_smoke_result(serde_json::json!({
          "ok": false,
          "phase": "init",
          "error": "app_state_unavailable",
        }));
        return;
    };

    if !state.try_begin_sync() {
        write_smoke_result(serde_json::json!({
          "ok": false,
          "phase": "init",
          "error": "sync_already_running",
        }));
        return;
    }

    let started_at = now_ms();
    let result = (|| -> Result<serde_json::Value, String> {
        let previous = {
            let repository = state
                .repository
                .lock()
                .map_err(|_| AppError::StateLock.to_string())?;
            repository
                .get_icloud_sync_status()
                .map_err(|error| error.to_string())?
        };

        {
            let mut repository = state
                .repository
                .lock()
                .map_err(|_| AppError::StateLock.to_string())?;
            if !previous.enabled {
                repository
                    .set_icloud_sync_enabled(true)
                    .map_err(|error| error.to_string())?;
            }
        }

        state.set_sync_phase(SyncRuntimePhase::Syncing);
        let sync_result = SyncEngine::run_once(&state, None).map_err(|error| error.to_string());
        let debug_info = {
            let repository = state
                .repository
                .lock()
                .map_err(|_| AppError::StateLock.to_string())?;
            repository
                .get_icloud_sync_debug_info()
                .map_err(|error| error.to_string())?
        };

        if !previous.enabled {
            let mut repository = state
                .repository
                .lock()
                .map_err(|_| AppError::StateLock.to_string())?;
            repository
                .set_icloud_sync_enabled(false)
                .map_err(|error| error.to_string())?;
        }

        let outcome = sync_result?;
        let status = outcome.status;
        Ok(serde_json::json!({
          "ok": true,
          "phase": "completed",
          "startedAt": started_at,
          "completedAt": now_ms(),
          "status": {
            "enabled": status.enabled,
            "state": status.state,
            "accountStatus": status.account_status,
            "pendingOperationCount": status.pending_operation_count,
            "lastSyncSucceededAtMs": status.last_sync_succeeded_at_ms,
            "lastErrorCode": status.last_error_code,
            "lastErrorMessage": status.last_error_message,
          },
          "debug": {
            "pendingOperationCount": debug_info.pending_operation_count,
            "processingOperationCount": debug_info.processing_operation_count,
            "failedOperationCount": debug_info.failed_operation_count,
            "coalescedIntentCount": debug_info.coalesced_intent_count,
            "tombstoneCount": debug_info.tombstone_count,
            "serverChangeTokenPresent": debug_info.server_change_token_present,
            "deviceId": debug_info.device_id,
          }
        }))
    })();

    state.set_sync_phase(SyncRuntimePhase::Idle);

    match result {
        Ok(value) => write_smoke_result(value),
        Err(error) => write_smoke_result(serde_json::json!({
          "ok": false,
          "phase": "completed",
          "startedAt": started_at,
          "completedAt": now_ms(),
          "error": error,
        })),
    }
}

fn setup_startup_smoke(app: &tauri::App) {
    let should_open_settings =
        env_flag(OPEN_SETTINGS_ON_START_ENV) || has_arg(OPEN_SETTINGS_ON_START_ARG);
    let should_run_sync =
        env_flag(RUN_ICLOUD_SYNC_ON_START_ENV) || has_arg(RUN_ICLOUD_SYNC_ON_START_ARG);
    if !should_open_settings && !should_run_sync {
        return;
    }

    let app_handle = app.handle().clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(2));

        if should_open_settings {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = show_main_window(&app_handle);
                let _ = window.emit("tray-open-settings", ());
            }
        }

        if should_run_sync {
            run_icloud_startup_smoke(&app_handle);
        }
    });
}

fn initialize_app_state(app_dir: &Path) -> Result<AppState, StartupError> {
    fs::create_dir_all(app_dir).map_err(StartupError::PrepareAppDataDir)?;
    let database_path = app_dir.join("minnote.sqlite3");
    AppState::new(&database_path).map_err(StartupError::InitializeState)
}

fn load_startup_settings(app_state: &AppState) -> Result<AppSettings, StartupError> {
    let repository = app_state
        .repository
        .lock()
        .map_err(|_| StartupError::LoadSettings(crate::error::AppError::StateLock))?;
    repository
        .get_app_settings()
        .map_err(StartupError::LoadSettings)
}

pub(crate) fn sync_tray_icon_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        if app.tray_by_id(TRAY_ID).is_none() {
            build_tray_icon(app).map_err(|error| error.to_string())?;
        }
    } else {
        let _ = app.remove_tray_by_id(TRAY_ID);
    }

    Ok(())
}

pub(crate) fn sync_menu_bar_icon_runtime_state(
    state: &AppState,
    app: &tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    match sync_tray_icon_enabled(app, enabled) {
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

pub(crate) fn show_startup_error_dialog(message: &str) {
    let _ = rfd::MessageDialog::new()
        .set_title("MinNote 초기화 실패")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
        .show();
}

pub(crate) fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StartupError::ResolveAppDataDir)?;
    let app_state = initialize_app_state(&app_dir)?;
    let settings = load_startup_settings(&app_state)?;

    let menu_bar_icon_enabled = settings.menu_bar_icon_enabled;

    app.manage(app_state);

    if let Some(managed_state) = app.try_state::<AppState>() {
        apply_window_preferences_with_settings(app.handle(), &settings)
            .map_err(StartupError::ApplyWindowPreferences)?;

        if menu_bar_icon_enabled && app.tray_by_id(TRAY_ID).is_none() {
            if let Err(error) = sync_menu_bar_icon_runtime_state(&managed_state, app.handle(), true)
            {
                let message = format!("메뉴바 아이콘을 초기화하지 못했습니다: {error}");
                log::warn!("{message}");
                managed_state.set_menu_bar_icon_error(Some(message));
            } else {
                managed_state.set_menu_bar_icon_error(None);
            }
        } else {
            managed_state.set_menu_bar_icon_error(None);
        }
    }

    SyncEngine::start_worker(app.handle().clone());

    register_saved_global_shortcut(app.handle());

    #[cfg(target_os = "macos")]
    setup_activation_listener(app.handle().clone());

    setup_startup_smoke(app);

    if cfg!(debug_assertions) {
        app.handle().plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )?;
    }

    Ok(())
}

pub(crate) fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if let Some(state) = window.app_handle().try_state::<AppState>() {
            if state.shutdown_confirmed() {
                return;
            }
        }

        let tray_enabled = window.app_handle().tray_by_id(TRAY_ID).is_some();
        if tray_enabled {
            let _ = window.app_handle().save_window_state(StateFlags::all());
            api.prevent_close();
            let _ = window.hide();
        } else {
            api.prevent_close();
            emit_shutdown_request(window.app_handle());
        }
    }
}

pub(crate) fn handle_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    match event {
        tauri::RunEvent::Reopen { .. } => {
            let _ = show_main_window(app);
        }
        tauri::RunEvent::ExitRequested { api, .. } => {
            if let Some(state) = app.try_state::<AppState>() {
                if state.shutdown_confirmed() {
                    state.set_shutdown_confirmed(false);
                    return;
                }
            }

            api.prevent_exit();
            emit_shutdown_request(app);
        }
        _ => {}
    }
}
