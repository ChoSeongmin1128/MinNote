pub mod blocks;
pub mod bootstrap;
pub mod documents;
pub mod preferences;
mod workspace_payload;

pub use blocks::{
  change_block_kind,
  create_block_below,
  delete_block,
  move_block,
  restore_document_blocks,
  update_code_block,
  update_markdown_block,
  update_text_block,
};
pub use bootstrap::{bootstrap_app, list_documents};
pub use documents::{
  create_document,
  delete_all_documents,
  delete_document,
  empty_trash,
  flush_document,
  open_document,
  rename_document,
  restore_document_from_trash,
  search_documents,
  set_document_block_tint_override,
  set_document_surface_tone_override,
};
pub use preferences::{
  set_always_on_top_enabled,
  set_body_font_family,
  set_body_font_size_px,
  set_code_font_family,
  set_code_font_size_px,
  set_default_block_kind,
  set_default_block_tint_preset,
  set_default_document_surface_tone_preset,
  set_global_toggle_shortcut,
  set_menu_bar_icon_enabled,
  set_theme_mode,
  set_window_opacity_percent,
};
pub(crate) use workspace_payload::{
  build_workspace_payload,
  hydrate_document,
  now_ms,
  resolve_current_document_id,
  TRASH_TTL_MS,
};

#[cfg(test)]
mod tests;
