use std::time::{SystemTime, UNIX_EPOCH};

use crate::application::dto::{BlockDto, BootstrapPayload, DocumentDto, DocumentSummaryDto};
use crate::domain::models::{AppSettings, Document, DocumentSummary, ICloudAccountStatus, ICloudSyncState, ICloudSyncStatus};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

pub(crate) fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or_else(|error| {
      log::warn!("현재 시각을 계산하지 못했습니다: {error}");
      0
    })
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
    icloud_sync_status: ICloudSyncStatus {
      enabled: false,
      state: ICloudSyncState::Disabled,
      account_status: ICloudAccountStatus::Unknown,
      pending_operation_count: 0,
      last_sync_started_at_ms: None,
      last_sync_succeeded_at_ms: None,
      last_error_code: None,
      last_error_message: None,
    },
    theme_mode: settings.theme_mode,
    default_block_tint_preset: settings.default_block_tint_preset,
    default_document_surface_tone_preset: settings.default_document_surface_tone_preset,
    default_block_kind: settings.default_block_kind,
    body_font_family: settings.body_font_family,
    body_font_size_px: settings.body_font_size_px,
    code_font_family: settings.code_font_family,
    code_font_size_px: settings.code_font_size_px,
    menu_bar_icon_enabled: settings.menu_bar_icon_enabled,
    always_on_top_enabled: settings.always_on_top_enabled,
    window_opacity_percent: settings.window_opacity_percent,
    global_toggle_shortcut: settings.global_toggle_shortcut,
    global_shortcut_error: None,
    menu_bar_icon_error: None,
    window_preference_error: None,
  }
}

pub(crate) fn resolve_current_document_id(
  documents: &[DocumentSummary],
  preferred_document_id: Option<String>,
) -> Option<String> {
  preferred_document_id
    .filter(|preferred_id| documents.iter().any(|document| document.id == *preferred_id))
    .or_else(|| documents.first().map(|document| document.id.clone()))
}

pub(crate) fn build_workspace_payload(
  repository: &mut dyn AppRepository,
  preferred_current_document_id: Option<String>,
) -> Result<BootstrapPayload, AppError> {
  let settings = repository.get_app_settings()?;
  let documents = repository.list_documents()?;
  let trash_documents = repository.list_trash_documents()?;
  let current_document_id = resolve_current_document_id(&documents, preferred_current_document_id);
  let current_document = current_document_id
    .as_deref()
    .map(|document_id| super::documents::open_document(repository, document_id))
    .transpose()?;

  Ok(build_bootstrap_payload(
    settings,
    documents,
    trash_documents,
    current_document,
  ))
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
