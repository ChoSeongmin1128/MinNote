use std::time::{SystemTime, UNIX_EPOCH};

use crate::application::dto::{BlockDto, BlockRestoreDto, BootstrapPayload, DocumentDto, DocumentSummaryDto, RemoteBlockJson, RemoteDocumentDto, SearchResultDto};
use crate::domain::models::{BlockKind, BlockTintPreset, ThemeMode};
use crate::error::AppError;
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
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
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
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
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
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
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
    default_block_kind: settings.default_block_kind,
    icloud_sync_enabled: settings.icloud_sync_enabled,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
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
  repository.restore_blocks(document_id, &blocks)?;
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

pub fn set_default_block_kind(
  repository: &mut impl AppRepository,
  kind: BlockKind,
) -> Result<BlockKind, AppError> {
  repository.set_default_block_kind(kind.clone())?;
  Ok(kind)
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

    let document = repository.upsert_document_from_remote(
      &remote.id,
      remote.title,
      block_tint,
      remote.created_at,
      remote.updated_at,
      remote.deleted_at,
    )?;

    // deleted_at이 없는 문서만 블록을 복원
    if document.deleted_at.is_none() {
      let remote_blocks: Vec<RemoteBlockJson> =
        serde_json::from_str(&remote.blocks_json).unwrap_or_default();

      let restore_dtos: Vec<BlockRestoreDto> = remote_blocks
        .into_iter()
        .map(|b| BlockRestoreDto {
          id: b.id,
          kind: crate::domain::models::BlockKind::from_str(&b.kind),
          content: b.content,
          language: b.language,
          position: b.position,
        })
        .collect();

      if !restore_dtos.is_empty() {
        repository.restore_blocks(&remote.id, &restore_dtos)?;
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
