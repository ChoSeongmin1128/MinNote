mod app_runtime;
mod application;
mod commands;
mod domain;
mod error;
mod infrastructure;
mod ports;
mod state;
mod window_controls;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .setup(app_runtime::setup_app)
    .on_window_event(app_runtime::handle_window_event)
    .invoke_handler(tauri::generate_handler![
      commands::workspace::bootstrap_app,
      commands::window_controls::get_window_control_runtime_state,
      commands::workspace::list_documents,
      commands::workspace::open_document,
      commands::workspace::create_document,
      commands::workspace::rename_document,
      commands::workspace::delete_document,
      commands::workspace::delete_all_documents,
      commands::workspace::search_documents,
      commands::blocks::create_block_below,
      commands::blocks::change_block_kind,
      commands::blocks::move_block,
      commands::blocks::delete_block,
      commands::blocks::update_markdown_block,
      commands::blocks::update_code_block,
      commands::blocks::update_text_block,
      commands::workspace::flush_document,
      commands::icloud_sync::get_icloud_sync_status,
      commands::icloud_sync::get_icloud_sync_debug_info,
      commands::icloud_sync::set_icloud_sync_enabled,
      commands::icloud_sync::run_icloud_sync,
      commands::icloud_sync::reset_icloud_sync_checkpoint,
      commands::icloud_sync::force_upload_all_documents,
      commands::icloud_sync::force_redownload_from_cloud,
      commands::preferences::set_theme_mode,
      commands::preferences::set_default_block_tint_preset,
      commands::preferences::set_default_document_surface_tone_preset,
      commands::preferences::set_body_font_family,
      commands::preferences::set_body_font_size_px,
      commands::preferences::set_code_font_family,
      commands::preferences::set_code_font_size_px,
      commands::preferences::set_document_block_tint_override,
      commands::preferences::set_document_surface_tone_override,
      commands::blocks::restore_document_blocks,
      commands::workspace::empty_trash,
      commands::workspace::restore_document_from_trash,
      commands::window_controls::confirm_app_shutdown,
      commands::preferences::set_menu_bar_icon_enabled,
      commands::preferences::set_default_block_kind,
      commands::preferences::set_always_on_top_enabled,
      commands::window_controls::preview_window_opacity_percent,
      commands::preferences::set_window_opacity_percent,
      commands::preferences::set_global_toggle_shortcut,
    ]);

  match builder.build(tauri::generate_context!()) {
    Ok(app) => app.run(app_runtime::handle_run_event),
    Err(error) => {
      let message = error.to_string();
      log::error!("MinNote startup failed: {message}");
      app_runtime::show_startup_error_dialog(&message);
    }
  }
}
