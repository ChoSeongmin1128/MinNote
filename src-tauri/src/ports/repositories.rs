use crate::domain::models::{AppSettings, Block, BlockKind, BlockTintPreset, Document, DocumentSummary, DocumentSurfaceTonePreset, SearchResult, ThemeMode};
use crate::error::AppError;
use crate::ports::models::RestoreBlockInput;

pub trait DocumentRepository {
  fn ensure_initial_document(&mut self) -> Result<(), AppError>;
  fn list_documents(&self) -> Result<Vec<DocumentSummary>, AppError>;
  fn list_trash_documents(&self) -> Result<Vec<DocumentSummary>, AppError>;
  fn get_document(&self, document_id: &str) -> Result<Option<Document>, AppError>;
  fn create_document(&mut self, title: Option<String>) -> Result<Document, AppError>;
  fn rename_document(&mut self, document_id: &str, title: Option<String>) -> Result<Document, AppError>;
  fn delete_document(&mut self, document_id: &str) -> Result<(), AppError>;
  fn restore_document_from_trash(&mut self, document_id: &str) -> Result<Document, AppError>;
  fn purge_expired_trash(&mut self, cutoff_ms: i64) -> Result<(), AppError>;
  fn empty_trash(&mut self) -> Result<(), AppError>;
  fn delete_all_documents(&mut self) -> Result<(), AppError>;
  fn set_document_block_tint_override(
    &mut self,
    document_id: &str,
    block_tint_override: Option<BlockTintPreset>,
  ) -> Result<Document, AppError>;
  fn set_document_surface_tone_override(
    &mut self,
    document_id: &str,
    document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  ) -> Result<Document, AppError>;
  fn mark_document_opened(&mut self, document_id: &str) -> Result<Document, AppError>;
  fn search_documents(&self, query: &str) -> Result<Vec<SearchResult>, AppError>;
  fn touch_document(&mut self, document_id: &str) -> Result<i64, AppError>;
}

pub trait BlockRepository {
  fn migrate_legacy_markdown_blocks(&mut self) -> Result<(), AppError>;
  fn list_blocks(&self, document_id: &str) -> Result<Vec<Block>, AppError>;
  fn create_block_below(
    &mut self,
    document_id: &str,
    after_block_id: Option<&str>,
    kind: BlockKind,
  ) -> Result<Vec<Block>, AppError>;
  fn change_block_kind(&mut self, block_id: &str, kind: BlockKind) -> Result<Block, AppError>;
  fn move_block(&mut self, document_id: &str, block_id: &str, target_position: i64) -> Result<Vec<Block>, AppError>;
  fn delete_block(&mut self, block_id: &str) -> Result<String, AppError>;
  fn update_markdown_block(&mut self, block_id: &str, content: String) -> Result<Block, AppError>;
  fn update_code_block(
    &mut self,
    block_id: &str,
    content: String,
    language: Option<String>,
  ) -> Result<Block, AppError>;
  fn update_text_block(&mut self, block_id: &str, content: String) -> Result<Block, AppError>;
  fn restore_blocks(
    &mut self,
    document_id: &str,
    blocks: &[RestoreBlockInput],
  ) -> Result<Vec<Block>, AppError>;
}

pub trait AppStateRepository {
  fn get_last_opened_document_id(&self) -> Result<Option<String>, AppError>;
  fn set_last_opened_document_id(&mut self, document_id: &str) -> Result<(), AppError>;
  fn get_app_settings(&self) -> Result<AppSettings, AppError>;
  fn set_theme_mode(&mut self, theme_mode: ThemeMode) -> Result<(), AppError>;
  fn set_default_block_tint_preset(&mut self, preset: BlockTintPreset) -> Result<(), AppError>;
  fn set_default_document_surface_tone_preset(&mut self, preset: DocumentSurfaceTonePreset) -> Result<(), AppError>;
  fn set_icloud_sync_enabled(&mut self, enabled: bool) -> Result<(), AppError>;
  fn set_menu_bar_icon_enabled(&mut self, enabled: bool) -> Result<(), AppError>;
  fn set_default_block_kind(&mut self, kind: BlockKind) -> Result<(), AppError>;
}

pub trait RemoteSyncRepository {
  fn upsert_document_from_remote(
    &mut self,
    id: &str,
    title: Option<String>,
    block_tint_override: Option<crate::domain::models::BlockTintPreset>,
    document_surface_tone_override: Option<crate::domain::models::DocumentSurfaceTonePreset>,
    created_at: i64,
    updated_at: i64,
    deleted_at: Option<i64>,
  ) -> Result<crate::domain::models::Document, AppError>;
  fn rebuild_search_index_for_document(&self, document_id: &str) -> Result<(), AppError>;
}

pub trait AppRepository: DocumentRepository + BlockRepository + AppStateRepository + RemoteSyncRepository {}

impl<T> AppRepository for T where T: DocumentRepository + BlockRepository + AppStateRepository + RemoteSyncRepository {}
