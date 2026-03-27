use std::time::{SystemTime, UNIX_EPOCH};

use crate::application::dto::{BlockDto, BootstrapPayload, DocumentDto, DocumentSummaryDto};
use crate::domain::models::{AppSettings, Document, DocumentSummary};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

pub mod blocks;
pub mod bootstrap;
pub mod documents;
pub mod preferences;

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
  set_default_block_kind,
  set_default_block_tint_preset,
  set_default_document_surface_tone_preset,
  set_global_toggle_shortcut,
  set_menu_bar_icon_enabled,
  set_theme_mode,
  set_window_opacity_percent,
};

pub(crate) fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

pub(crate) const TRASH_TTL_MS: i64 = 30 * 86_400_000;

pub(crate) fn build_bootstrap_payload(
  settings: AppSettings,
  documents: Vec<DocumentSummary>,
  trash_documents: Vec<DocumentSummary>,
  current_document: Option<DocumentDto>,
) -> BootstrapPayload {
  BootstrapPayload {
    documents: documents.into_iter().map(DocumentSummaryDto::from).collect(),
    trash_documents: trash_documents.into_iter().map(DocumentSummaryDto::from).collect(),
    current_document,
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
  }
}

pub(crate) fn hydrate_document(
  repository: &mut dyn AppRepository,
  document_id: &str,
  document_override: Option<Document>,
) -> Result<DocumentDto, AppError> {
  let document = match document_override {
    Some(document) => document,
    None => repository
      .get_document(document_id)?
      .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))?,
  };

  let blocks = repository.list_blocks(document_id)?;
  let preview = blocks
    .iter()
    .find_map(|block| (!block.search_text.trim().is_empty()).then(|| block.search_text.trim().to_string()))
    .unwrap_or_default();
  let blocks = blocks
    .into_iter()
    .map(BlockDto::try_from)
    .collect::<Result<Vec<_>, _>>()?;

  Ok(DocumentDto::new(document, preview, blocks))
}

#[cfg(test)]
mod tests {
  use super::*;

  use crate::domain::models::{
    Block,
    BlockKind,
    BlockTintPreset,
    DocumentSurfaceTonePreset,
    SearchResult,
    ThemeMode,
  };
  use crate::ports::models::RestoreBlockInput;
  use crate::ports::repositories::{AppStateRepository, BlockRepository, DocumentRepository};

  struct MockRepository {
    settings: AppSettings,
    current_document: Document,
    current_blocks: Vec<Block>,
    document_summaries: Vec<DocumentSummary>,
    trash_document_summaries: Vec<DocumentSummary>,
    last_opened_document_id: Option<String>,
    restored_inputs: Vec<Vec<RestoreBlockInput>>,
  }

  impl MockRepository {
    fn new(default_block_kind: BlockKind) -> Self {
      let document = Document {
        id: "doc-1".to_string(),
        title: Some("Doc".to_string()),
        block_tint_override: Some(BlockTintPreset::Mist),
        document_surface_tone_override: Some(DocumentSurfaceTonePreset::Paper),
        created_at: 1,
        updated_at: 2,
        last_opened_at: 3,
        deleted_at: None,
      };
      let block = Block {
        id: "block-1".to_string(),
        document_id: document.id.clone(),
        kind: BlockKind::Markdown,
        position: 0,
        content: "# Hello".to_string(),
        search_text: "Hello".to_string(),
        language: None,
        created_at: 1,
        updated_at: 2,
      };
      let summary = DocumentSummary {
        id: document.id.clone(),
        title: document.title.clone(),
        block_tint_override: document.block_tint_override.clone(),
        document_surface_tone_override: document.document_surface_tone_override.clone(),
        preview: "Hello".to_string(),
        updated_at: document.updated_at,
        last_opened_at: document.last_opened_at,
        block_count: 1,
      };

      Self {
        settings: AppSettings {
          theme_mode: ThemeMode::Dark,
          default_block_tint_preset: BlockTintPreset::OceanSand,
          default_document_surface_tone_preset: DocumentSurfaceTonePreset::Paper,
          default_block_kind,
          menu_bar_icon_enabled: false,
          always_on_top_enabled: true,
          window_opacity_percent: 84,
          global_toggle_shortcut: Some("Option+M".to_string()),
        },
        current_document: document,
        current_blocks: vec![block],
        document_summaries: vec![summary],
        trash_document_summaries: vec![],
        last_opened_document_id: Some("doc-1".to_string()),
        restored_inputs: vec![],
      }
    }
  }

  impl DocumentRepository for MockRepository {
    fn ensure_initial_document(&mut self) -> Result<(), AppError> { Ok(()) }
    fn list_documents(&self) -> Result<Vec<DocumentSummary>, AppError> { Ok(self.document_summaries.clone()) }
    fn list_trash_documents(&self) -> Result<Vec<DocumentSummary>, AppError> { Ok(self.trash_document_summaries.clone()) }
    fn get_document(&self, document_id: &str) -> Result<Option<Document>, AppError> {
      Ok((document_id == self.current_document.id).then(|| self.current_document.clone()))
    }
    fn create_document(&mut self, _title: Option<String>) -> Result<Document, AppError> { unimplemented!() }
    fn rename_document(&mut self, _document_id: &str, _title: Option<String>) -> Result<Document, AppError> { unimplemented!() }
    fn delete_document(&mut self, _document_id: &str) -> Result<(), AppError> { Ok(()) }
    fn restore_document_from_trash(&mut self, _document_id: &str) -> Result<Document, AppError> {
      Ok(self.current_document.clone())
    }
    fn purge_expired_trash(&mut self, _cutoff_ms: i64) -> Result<(), AppError> { Ok(()) }
    fn empty_trash(&mut self) -> Result<(), AppError> { Ok(()) }
    fn delete_all_documents(&mut self) -> Result<(), AppError> { Ok(()) }
    fn set_document_block_tint_override(
      &mut self,
      _document_id: &str,
      _block_tint_override: Option<BlockTintPreset>,
    ) -> Result<Document, AppError> { unimplemented!() }
    fn set_document_surface_tone_override(
      &mut self,
      _document_id: &str,
      _document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
    ) -> Result<Document, AppError> { unimplemented!() }
    fn mark_document_opened(&mut self, _document_id: &str) -> Result<Document, AppError> {
      Ok(self.current_document.clone())
    }
    fn search_documents(&self, _query: &str) -> Result<Vec<SearchResult>, AppError> { unimplemented!() }
    fn touch_document(&mut self, _document_id: &str) -> Result<i64, AppError> { Ok(999) }
  }

  impl BlockRepository for MockRepository {
    fn migrate_legacy_markdown_blocks(&mut self) -> Result<(), AppError> { Ok(()) }
    fn list_blocks(&self, _document_id: &str) -> Result<Vec<Block>, AppError> { Ok(self.current_blocks.clone()) }
    fn create_block_below(
      &mut self,
      _document_id: &str,
      _after_block_id: Option<&str>,
      _kind: BlockKind,
    ) -> Result<Vec<Block>, AppError> { unimplemented!() }
    fn change_block_kind(&mut self, _block_id: &str, _kind: BlockKind) -> Result<Block, AppError> { unimplemented!() }
    fn move_block(&mut self, _document_id: &str, _block_id: &str, _target_position: i64) -> Result<Vec<Block>, AppError> { unimplemented!() }
    fn delete_block(&mut self, _block_id: &str) -> Result<String, AppError> { unimplemented!() }
    fn update_markdown_block(&mut self, _block_id: &str, _content: String) -> Result<Block, AppError> { unimplemented!() }
    fn update_code_block(&mut self, _block_id: &str, _content: String, _language: Option<String>) -> Result<Block, AppError> { unimplemented!() }
    fn update_text_block(&mut self, _block_id: &str, _content: String) -> Result<Block, AppError> { unimplemented!() }
    fn restore_blocks(&mut self, _document_id: &str, blocks: &[RestoreBlockInput]) -> Result<Vec<Block>, AppError> {
      self.restored_inputs.push(blocks.to_vec());
      Ok(self.current_blocks.clone())
    }
  }

  impl AppStateRepository for MockRepository {
    fn get_last_opened_document_id(&self) -> Result<Option<String>, AppError> {
      Ok(self.last_opened_document_id.clone())
    }
    fn set_last_opened_document_id(&mut self, document_id: &str) -> Result<(), AppError> {
      self.last_opened_document_id = Some(document_id.to_string());
      Ok(())
    }
    fn get_app_settings(&self) -> Result<AppSettings, AppError> { Ok(self.settings.clone()) }
    fn set_theme_mode(&mut self, _theme_mode: ThemeMode) -> Result<(), AppError> { Ok(()) }
    fn set_default_block_tint_preset(&mut self, _preset: BlockTintPreset) -> Result<(), AppError> { Ok(()) }
    fn set_default_document_surface_tone_preset(
      &mut self,
      _preset: DocumentSurfaceTonePreset,
    ) -> Result<(), AppError> { Ok(()) }
    fn set_menu_bar_icon_enabled(&mut self, _enabled: bool) -> Result<(), AppError> { Ok(()) }
    fn set_default_block_kind(&mut self, _kind: BlockKind) -> Result<(), AppError> { Ok(()) }
    fn set_always_on_top_enabled(&mut self, _enabled: bool) -> Result<(), AppError> { Ok(()) }
    fn set_window_opacity_percent(&mut self, _percent: u8) -> Result<(), AppError> { Ok(()) }
    fn set_global_toggle_shortcut(&mut self, _shortcut: Option<&str>) -> Result<(), AppError> { Ok(()) }
  }

  #[test]
  fn bootstrap_app_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Code);

    let payload = bootstrap::bootstrap_app(&mut repository).expect("bootstrap should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Code);
    assert!(payload.always_on_top_enabled);
    assert_eq!(payload.window_opacity_percent, 84);
    assert_eq!(payload.global_toggle_shortcut.as_deref(), Some("Option+M"));
  }

  #[test]
  fn restore_document_from_trash_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Text);

    let payload = documents::restore_document_from_trash(&mut repository, "doc-1")
      .expect("restore from trash should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Text);
  }

  #[test]
  fn delete_all_documents_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Markdown);

    let payload = documents::delete_all_documents(&mut repository)
      .expect("delete all documents should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Markdown);
  }

  #[test]
  fn restore_document_blocks_converts_application_dto_to_restore_input() {
    let mut repository = MockRepository::new(BlockKind::Markdown);

    blocks::restore_document_blocks(
      &mut repository,
      "doc-1",
      vec![BlockRestoreDto {
        id: "block-restore".to_string(),
        kind: BlockKind::Code,
        content: "println!(\"hello\")".to_string(),
        language: Some("rust".to_string()),
        position: 2,
      }],
    ).expect("restore document blocks should succeed");

    assert_eq!(
      repository.restored_inputs,
      vec![vec![RestoreBlockInput {
        id: "block-restore".to_string(),
        kind: BlockKind::Code,
        content: "println!(\"hello\")".to_string(),
        language: Some("rust".to_string()),
        position: 2,
      }]],
    );
  }

  #[test]
  fn set_window_opacity_percent_rejects_out_of_range_value() {
    let mut repository = MockRepository::new(BlockKind::Markdown);

    let error = preferences::set_window_opacity_percent(&mut repository, 40).expect_err("should fail");

    assert_eq!(error.to_string(), "창 투명도는 50%에서 100% 사이여야 합니다.");
  }
}
