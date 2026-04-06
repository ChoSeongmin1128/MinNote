#[cfg(target_os = "macos")]
use std::mem;
#[cfg(target_os = "macos")]
use std::sync::{Once, OnceLock};

#[cfg(target_os = "macos")]
use objc2::ffi;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyClass, AnyObject, Imp, ProtocolObject, Sel};
#[cfg(target_os = "macos")]
use objc2::{sel, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSApplicationDelegate};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSData, NSDictionary, NSError, NSString};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
use crate::infrastructure::sync_engine::SyncEngine;
#[cfg(target_os = "macos")]
use crate::state::{AppState, SyncTriggerReason};

#[cfg(target_os = "macos")]
static REMOTE_NOTIFICATION_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
#[cfg(target_os = "macos")]
static REMOTE_NOTIFICATION_METHODS: Once = Once::new();

#[cfg(target_os = "macos")]
pub(crate) fn setup_remote_notifications(app_handle: AppHandle) {
  let _ = REMOTE_NOTIFICATION_APP_HANDLE.set(app_handle.clone());

  let Some(mtm) = MainThreadMarker::new() else {
    log::warn!("APNs 등록을 건너뜁니다: main thread에서 AppKit API를 호출할 수 없습니다");
    return;
  };

  let app = NSApplication::sharedApplication(mtm);
  let Some(delegate) = app.delegate() else {
    log::warn!("APNs 등록을 건너뜁니다: NSApplication delegate를 찾지 못했습니다");
    return;
  };

  install_remote_notification_methods(delegate.as_ref());

  app.registerForRemoteNotifications();
  log::info!("APNs remote notification 등록을 요청했습니다");
}

#[cfg(target_os = "macos")]
fn install_remote_notification_methods(delegate: &ProtocolObject<dyn NSApplicationDelegate>) {
  let object: &AnyObject = delegate.as_ref();
  let class = object.class();
  let class_name = class.name().to_string_lossy().into_owned();

  REMOTE_NOTIFICATION_METHODS.call_once(|| unsafe {
    add_delegate_method(
      class,
      sel!(application:didRegisterForRemoteNotificationsWithDeviceToken:),
      mem::transmute::<
        unsafe extern "C-unwind" fn(&AnyObject, Sel, &NSApplication, &NSData),
        Imp,
      >(did_register_for_remote_notifications_with_device_token),
      c"v@:@@",
    );
    add_delegate_method(
      class,
      sel!(application:didFailToRegisterForRemoteNotificationsWithError:),
      mem::transmute::<
        unsafe extern "C-unwind" fn(&AnyObject, Sel, &NSApplication, &NSError),
        Imp,
      >(did_fail_to_register_for_remote_notifications_with_error),
      c"v@:@@",
    );
    add_delegate_method(
      class,
      sel!(application:didReceiveRemoteNotification:),
      mem::transmute::<
        unsafe extern "C-unwind"
          fn(&AnyObject, Sel, &NSApplication, &NSDictionary<NSString, AnyObject>),
        Imp,
      >(did_receive_remote_notification),
      c"v@:@@",
    );
  });

  log::info!("APNs delegate hook을 설치했습니다: {class_name}");
}

#[cfg(target_os = "macos")]
unsafe fn add_delegate_method(class: &AnyClass, selector: Sel, imp: Imp, encoding: &std::ffi::CStr) {
  let class_ptr = class as *const AnyClass as *mut AnyClass;
  let added = ffi::class_addMethod(class_ptr, selector, imp, encoding.as_ptr()).as_bool();
  if !added {
    log::debug!(
      "APNs delegate method가 이미 존재하거나 추가되지 않았습니다: {} {}",
      class.name().to_string_lossy(),
      selector.name().to_string_lossy()
    );
  }
}

#[cfg(target_os = "macos")]
unsafe extern "C-unwind" fn did_register_for_remote_notifications_with_device_token(
  _this: &AnyObject,
  _cmd: Sel,
  _application: &NSApplication,
  device_token: &NSData,
) {
  log::info!(
    "APNs remote notification 등록에 성공했습니다. device token bytes={}",
    device_token.length()
  );
}

#[cfg(target_os = "macos")]
unsafe extern "C-unwind" fn did_fail_to_register_for_remote_notifications_with_error(
  _this: &AnyObject,
  _cmd: Sel,
  _application: &NSApplication,
  error: &NSError,
) {
  log::warn!(
    "APNs remote notification 등록에 실패했습니다: {} ({})",
    error.localizedDescription().to_string(),
    error.code()
  );
}

#[cfg(target_os = "macos")]
unsafe extern "C-unwind" fn did_receive_remote_notification(
  _this: &AnyObject,
  _cmd: Sel,
  _application: &NSApplication,
  _user_info: &NSDictionary<NSString, AnyObject>,
) {
  let Some(app_handle) = REMOTE_NOTIFICATION_APP_HANDLE.get() else {
    log::warn!("remote notification을 받았지만 AppHandle이 초기화되지 않았습니다");
    return;
  };

  let Some(state) = app_handle.try_state::<AppState>() else {
    log::warn!("remote notification을 받았지만 AppState를 찾지 못했습니다");
    return;
  };

  let sync_enabled = match state.repository.lock() {
    Ok(repository) => match repository.get_icloud_sync_status() {
      Ok(status) => status.enabled,
      Err(error) => {
        log::warn!("remote notification 처리 전에 iCloud 상태를 읽지 못했습니다: {error}");
        false
      }
    },
    Err(error) => {
      log::warn!("remote notification 처리 전에 저장소를 잠그지 못했습니다: {error}");
      false
    }
  };

  if !sync_enabled {
    log::debug!("remote notification을 받았지만 iCloud 동기화가 꺼져 있어 무시합니다");
    return;
  }

  state.reset_sync_backoff();
  state.schedule_sync(SyncTriggerReason::RemoteNotification, true);
  SyncEngine::emit_current_status(app_handle, state.inner());
  log::info!("remote notification을 받아 iCloud 동기화를 즉시 예약했습니다");
}
