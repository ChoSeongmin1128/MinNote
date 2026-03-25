use std::time::{SystemTime, UNIX_EPOCH};

use crate::application::dto::{BlockDto, BlockRestoreDto, BootstrapPayload, DocumentDto, DocumentSummaryDto, RemoteBlockJson, RemoteDocumentDto, SearchResultDto};
use crate::domain::models::{BlockKind, BlockTintPreset, DocumentSurfaceTonePreset, ThemeMode};
use crate::error::AppError;
use crate::ports::models::RestoreBlockInput;
use crate::ports::repositories::AppRepository;

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

const TRASH_TTL_MS: i64 = 86_400_000; // 24시간

pub fn bootstrap_app(repository: &mut impl AppRepository) -> Result<BootstrapPayload, AppError> {
  repository.purge_expired_trash(now_ms() - TRASH_TTL_MS)?;
  repository.ensure_initial_document()?;
  repository.migrate_legacy_markdown_blocks()?;
  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;
  let document_summaries = documents
    .clone()
    .into_iter()
    .map(DocumentSummaryDto::from)
    .collect::<Vec<_>>();

  let current_document_id = repository
    .get_last_opened_document_id()?
    .or_else(|| documents.first().map(|document| document.id.clone()));

  let current_document = current_document_id
    .as_deref()
    .map(|document_id| open_document(repository, document_id))
    .transpose()?;

  Ok(BootstrapPayload {
    documents: document_summaries,
    trash_documents: trash_documents.into_iter().map(DocumentSummaryDto::from).collect(),
    current_document,
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
  })
}

pub fn list_documents(repository: &mut impl AppRepository) -> Result<Vec<DocumentSummaryDto>, AppError> {
  Ok(
    repository
    .list_documents()?
    .into_iter()
    .map(DocumentSummaryDto::from)
    .collect::<Vec<_>>(),
  )
}

pub fn open_document(repository: &mut impl AppRepository, document_id: &str) -> Result<DocumentDto, AppError> {
  let document = repository.mark_document_opened(document_id)?;
  repository.set_last_opened_document_id(document_id)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn create_document(repository: &mut impl AppRepository) -> Result<DocumentDto, AppError> {
  let document = repository.create_document(None)?;
  let document_id = document.id.clone();
  repository.set_last_opened_document_id(&document_id)?;
  hydrate_document(repository, &document_id, Some(document))
}

pub fn rename_document(
  repository: &mut impl AppRepository,
  document_id: &str,
  title: Option<String>,
) -> Result<DocumentDto, AppError> {
  let document = repository.rename_document(document_id, title)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn delete_document(
  repository: &mut impl AppRepository,
  document_id: &str,
) -> Result<BootstrapPayload, AppError> {
  repository.delete_document(document_id)?;
  repository.ensure_initial_document()?;
  let settings = repository.get_app_settings()?;

  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;
  let current_document_id = repository
    .get_last_opened_document_id()?
    .filter(|stored| stored != document_id)
    .or_else(|| documents.first().map(|document| document.id.clone()));

  if let Some(current_document_id) = current_document_id.as_deref() {
    repository.set_last_opened_document_id(current_document_id)?;
  }

  let current_document = current_document_id
    .as_deref()
    .map(|id| open_document(repository, id))
    .transpose()?;

  Ok(BootstrapPayload {
    documents: documents.into_iter().map(DocumentSummaryDto::from).collect(),
    trash_documents: trash_documents.into_iter().map(DocumentSummaryDto::from).collect(),
    current_document,
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
  })
}

pub fn empty_trash(repository: &mut impl AppRepository) -> Result<(), AppError> {
  repository.empty_trash()
}

pub fn restore_document_from_trash(
  repository: &mut impl AppRepository,
  document_id: &str,
) -> Result<BootstrapPayload, AppError> {
  repository.restore_document_from_trash(document_id)?;
  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;

  let current_document_id = repository
    .get_last_opened_document_id()?
    .or_else(|| documents.first().map(|d| d.id.clone()));

  let current_document = current_document_id
    .as_deref()
    .map(|id| open_document(repository, id))
    .transpose()?;

  Ok(BootstrapPayload {
    documents: documents.into_iter().map(DocumentSummaryDto::from).collect(),
    trash_documents: trash_documents.into_iter().map(DocumentSummaryDto::from).collect(),
    current_document,
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
  })
}

pub fn delete_all_documents(repository: &mut impl AppRepository) -> Result<BootstrapPayload, AppError> {
  repository.delete_all_documents()?;
  repository.ensure_initial_document()?;

  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let current_document_id = documents
    .first()
    .map(|document| document.id.clone())
    .ok_or_else(|| AppError::validation("초기 문서를 만들지 못했습니다."))?;

  repository.set_last_opened_document_id(&current_document_id)?;
  let current_document = open_document(repository, &current_document_id)?;

  Ok(BootstrapPayload {
    documents: documents.into_iter().map(DocumentSummaryDto::from).collect(),
    trash_documents: vec![],
    current_document: Some(current_document),
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
  })
}

pub fn set_document_block_tint_override(
  repository: &mut impl AppRepository,
  document_id: &str,
  block_tint_override: Option<BlockTintPreset>,
) -> Result<DocumentDto, AppError> {
  let document = repository.set_document_block_tint_override(document_id, block_tint_override)?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn set_theme_mode(repository: &mut impl AppRepository, theme_mode: ThemeMode) -> Result<ThemeMode, AppError> {
  repository.set_theme_mode(theme_mode.clone())?;
  Ok(theme_mode)
}

pub fn set_default_block_tint_preset(
  repository: &mut impl AppRepository,
  preset: BlockTintPreset,
) -> Result<BlockTintPreset, AppError> {
  repository.set_default_block_tint_preset(preset.clone())?;
  Ok(preset)
}

pub fn set_default_document_surface_tone_preset(
  repository: &mut impl AppRepository,
  preset: DocumentSurfaceTonePreset,
) -> Result<DocumentSurfaceTonePreset, AppError> {
  repository.set_default_document_surface_tone_preset(preset.clone())?;
  Ok(preset)
}

pub fn search_documents(
  repository: &mut impl AppRepository,
  query: &str,
) -> Result<Vec<SearchResultDto>, AppError> {
  Ok(
    repository
    .search_documents(query)?
    .into_iter()
    .map(SearchResultDto::from)
    .collect::<Vec<_>>(),
  )
}

pub fn create_block_below(
  repository: &mut impl AppRepository,
  document_id: &str,
  after_block_id: Option<&str>,
  kind: BlockKind,
) -> Result<DocumentDto, AppError> {
  repository.create_block_below(document_id, after_block_id, kind)?;
  hydrate_document(repository, document_id, None)
}

pub fn change_block_kind(
  repository: &mut impl AppRepository,
  block_id: &str,
  kind: BlockKind,
) -> Result<BlockDto, AppError> {
  repository.change_block_kind(block_id, kind)?.try_into()
}

pub fn move_block(
  repository: &mut impl AppRepository,
  document_id: &str,
  block_id: &str,
  target_position: i64,
) -> Result<DocumentDto, AppError> {
  repository.move_block(document_id, block_id, target_position)?;
  hydrate_document(repository, document_id, None)
}

pub fn delete_block(repository: &mut impl AppRepository, block_id: &str) -> Result<DocumentDto, AppError> {
  let document_id = repository.delete_block(block_id)?;
  hydrate_document(repository, &document_id, None)
}

pub fn update_markdown_block(
  repository: &mut impl AppRepository,
  block_id: &str,
  content: String,
) -> Result<BlockDto, AppError> {
  repository.update_markdown_block(block_id, content)?.try_into()
}

pub fn update_code_block(
  repository: &mut impl AppRepository,
  block_id: &str,
  content: String,
  language: Option<String>,
) -> Result<BlockDto, AppError> {
  repository.update_code_block(block_id, content, language)?.try_into()
}

pub fn update_text_block(
  repository: &mut impl AppRepository,
  block_id: &str,
  content: String,
) -> Result<BlockDto, AppError> {
  repository.update_text_block(block_id, content)?.try_into()
}

pub fn flush_document(repository: &mut impl AppRepository, document_id: &str) -> Result<i64, AppError> {
  repository.touch_document(document_id)
}

pub fn restore_document_blocks(
  repository: &mut impl AppRepository,
  document_id: &str,
  blocks: Vec<BlockRestoreDto>,
) -> Result<DocumentDto, AppError> {
  let restore_inputs = blocks
    .into_iter()
    .map(|block| RestoreBlockInput {
      id: block.id,
      kind: block.kind,
      content: block.content,
      language: block.language,
      position: block.position,
    })
    .collect::<Vec<_>>();

  repository.restore_blocks(document_id, &restore_inputs)?;
  hydrate_document(repository, document_id, None)
}

pub fn set_icloud_sync_enabled(
  repository: &mut impl AppRepository,
  enabled: bool,
) -> Result<bool, AppError> {
  repository.set_icloud_sync_enabled(enabled)?;
  Ok(enabled)
}

pub fn set_menu_bar_icon_enabled(
  repository: &mut impl AppRepository,
  enabled: bool,
) -> Result<bool, AppError> {
  repository.set_menu_bar_icon_enabled(enabled)?;
  Ok(enabled)
}

pub fn set_document_surface_tone_override(
  repository: &mut impl AppRepository,
  document_id: &str,
  document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
) -> Result<DocumentDto, AppError> {
  let document = repository.set_document_surface_tone_override(
    document_id,
    document_surface_tone_override,
  )?;
  hydrate_document(repository, document_id, Some(document))
}

pub fn set_default_block_kind(
  repository: &mut impl AppRepository,
  kind: BlockKind,
) -> Result<BlockKind, AppError> {
  repository.set_default_block_kind(kind.clone())?;
  Ok(kind)
}

pub fn set_always_on_top_enabled(
  repository: &mut impl AppRepository,
  enabled: bool,
) -> Result<bool, AppError> {
  repository.set_always_on_top_enabled(enabled)?;
  Ok(enabled)
}

pub fn set_window_opacity_percent(
  repository: &mut impl AppRepository,
  percent: u8,
) -> Result<u8, AppError> {
  if !(50..=100).contains(&percent) {
    return Err(AppError::validation("창 투명도는 50%에서 100% 사이여야 합니다."));
  }

  repository.set_window_opacity_percent(percent)?;
  Ok(percent)
}

pub fn set_global_toggle_shortcut(
  repository: &mut impl AppRepository,
  shortcut: Option<String>,
) -> Result<Option<String>, AppError> {
  repository.set_global_toggle_shortcut(shortcut.as_deref())?;
  Ok(shortcut)
}

pub fn apply_remote_documents(
  repository: &mut impl AppRepository,
  documents: Vec<RemoteDocumentDto>,
) -> Result<BootstrapPayload, AppError> {
  for remote in documents {
    let block_tint = remote
      .block_tint_override
      .as_deref()
      .map(crate::domain::models::BlockTintPreset::from_str);
    let document_surface_tone = remote
      .document_surface_tone_override
      .as_deref()
      .map(crate::domain::models::DocumentSurfaceTonePreset::from_str);

    let document = repository.upsert_document_from_remote(
      &remote.id,
      remote.title,
      block_tint,
      document_surface_tone,
      remote.created_at,
      remote.updated_at,
      remote.deleted_at,
    )?;

    // deleted_at이 없는 문서만 블록을 복원
    if document.deleted_at.is_none() {
      let remote_blocks: Vec<RemoteBlockJson> =
        serde_json::from_str(&remote.blocks_json).unwrap_or_default();

      let restore_inputs: Vec<RestoreBlockInput> = remote_blocks
        .into_iter()
        .map(|b| RestoreBlockInput {
          id: b.id,
          kind: crate::domain::models::BlockKind::from_str(&b.kind),
          content: b.content,
          language: b.language,
          position: b.position,
        })
        .collect();

      if !restore_inputs.is_empty() {
        repository.restore_blocks(&remote.id, &restore_inputs)?;
      }

      repository.rebuild_search_index_for_document(&remote.id)?;
    }
  }

  bootstrap_app(repository)
}

fn hydrate_document(
  repository: &mut impl AppRepository,
  document_id: &str,
  document_override: Option<crate::domain::models::Document>,
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
    AppSettings,
    Block,
    BlockTintPreset,
    Document,
    DocumentSummary,
    DocumentSurfaceTonePreset,
    ThemeMode,
  };
  use crate::ports::models::RestoreBlockInput;
  use crate::ports::repositories::{AppStateRepository, BlockRepository, DocumentRepository, RemoteSyncRepository};

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
          icloud_sync_enabled: true,
          menu_bar_icon_enabled: false,
          always_on_top_enabled: true,
          window_opacity_percent: 84,
          global_toggle_shortcut: Some("Cmd+Shift+Space".to_string()),
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
    fn search_documents(&self, _query: &str) -> Result<Vec<crate::domain::models::SearchResult>, AppError> { unimplemented!() }
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
    fn set_icloud_sync_enabled(&mut self, _enabled: bool) -> Result<(), AppError> { Ok(()) }
    fn set_menu_bar_icon_enabled(&mut self, _enabled: bool) -> Result<(), AppError> { Ok(()) }
    fn set_default_block_kind(&mut self, _kind: BlockKind) -> Result<(), AppError> { Ok(()) }
    fn set_always_on_top_enabled(&mut self, _enabled: bool) -> Result<(), AppError> { Ok(()) }
    fn set_window_opacity_percent(&mut self, _percent: u8) -> Result<(), AppError> { Ok(()) }
    fn set_global_toggle_shortcut(&mut self, _shortcut: Option<&str>) -> Result<(), AppError> { Ok(()) }
  }

  impl RemoteSyncRepository for MockRepository {
    fn upsert_document_from_remote(
      &mut self,
      _id: &str,
      _title: Option<String>,
      _block_tint_override: Option<BlockTintPreset>,
      _document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
      _created_at: i64,
      _updated_at: i64,
      _deleted_at: Option<i64>,
    ) -> Result<Document, AppError> {
      Ok(self.current_document.clone())
    }
    fn rebuild_search_index_for_document(&self, _document_id: &str) -> Result<(), AppError> { Ok(()) }
  }

  #[test]
  fn bootstrap_app_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Code);

    let payload = bootstrap_app(&mut repository).expect("bootstrap should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Code);
    assert!(payload.always_on_top_enabled);
    assert_eq!(payload.window_opacity_percent, 84);
    assert_eq!(payload.global_toggle_shortcut.as_deref(), Some("Cmd+Shift+Space"));
  }

  #[test]
  fn restore_document_from_trash_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Text);

    let payload = restore_document_from_trash(&mut repository, "doc-1")
      .expect("restore from trash should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Text);
  }

  #[test]
  fn delete_all_documents_keeps_default_block_kind_in_payload() {
    let mut repository = MockRepository::new(BlockKind::Markdown);

    let payload = delete_all_documents(&mut repository)
      .expect("delete all documents should succeed");

    assert_eq!(payload.default_block_kind, BlockKind::Markdown);
  }

  #[test]
  fn restore_document_blocks_converts_application_dto_to_restore_input() {
    let mut repository = MockRepository::new(BlockKind::Markdown);

    restore_document_blocks(
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

    let error = set_window_opacity_percent(&mut repository, 40).expect_err("should fail");

    assert_eq!(error.to_string(), "창 투명도는 50%에서 100% 사이여야 합니다.");
  }
}
