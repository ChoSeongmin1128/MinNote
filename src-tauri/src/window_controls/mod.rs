mod shortcut_registration;
mod window_state;

pub(crate) use shortcut_registration::{
  register_saved_global_shortcut,
  update_global_shortcut_registration,
};
pub(crate) use window_state::{
  apply_window_preferences_with_settings,
  ensure_main_window_visible_on_screen,
  menu_bar_icon,
  preview_window_opacity,
  show_main_window,
  toggle_main_window,
};

pub const MIN_WINDOW_OPACITY_PERCENT: u8 = 50;
pub const MAX_WINDOW_OPACITY_PERCENT: u8 = 100;
