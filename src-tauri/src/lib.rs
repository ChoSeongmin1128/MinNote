mod application;
mod commands;
mod domain;
mod error;
mod infrastructure;
mod ports;
mod state;

use std::fs;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let app_dir = app.path().app_data_dir().expect("failed to resolve app data directory");
      fs::create_dir_all(&app_dir).expect("failed to create app data directory");

      let database_path = app_dir.join("minnote.sqlite3");
      let state = AppState::new(&database_path).expect("failed to initialize app state");
      app.manage(state);

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::bootstrap_app,
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
      commands::set_document_block_tint_override,
      commands::restore_document_blocks,
      commands::empty_trash,
      commands::restore_document_from_trash
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
