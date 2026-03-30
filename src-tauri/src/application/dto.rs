use serde::{Deserialize, Serialize};
use crate::domain::models::{Block, BlockKind, BlockTintPreset, BodyFontFamily, CodeFontFamily, Document, DocumentSummary, DocumentSurfaceTonePreset, SearchResult, ThemeMode};
use crate::error::AppError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockDto {
  pub id: String,
  pub document_id: String,
  pub kind: BlockKind,
  pub position: i64,
  pub content: String,
  pub language: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummaryDto {
  pub id: String,
  pub title: Option<String>,
  pub block_tint_override: Option<BlockTintPreset>,
  pub document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  pub preview: String,
  pub updated_at: i64,
  pub last_opened_at: i64,
  pub block_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDto {
  pub id: String,
  pub title: Option<String>,
  pub block_tint_override: Option<BlockTintPreset>,
  pub document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  pub preview: String,
  pub updated_at: i64,
  pub last_opened_at: i64,
  pub block_count: usize,
  pub blocks: Vec<BlockDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
  #[serde(flatten)]
  pub summary: DocumentSummaryDto,
  pub score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
  pub documents: Vec<DocumentSummaryDto>,
  pub trash_documents: Vec<DocumentSummaryDto>,
  pub current_document: Option<DocumentDto>,
  pub theme_mode: ThemeMode,
  pub default_block_tint_preset: BlockTintPreset,
  pub default_document_surface_tone_preset: DocumentSurfaceTonePreset,
  pub default_block_kind: BlockKind,
  pub body_font_family: BodyFontFamily,
  pub body_font_size_px: u8,
  pub code_font_family: CodeFontFamily,
  pub code_font_size_px: u8,
  pub menu_bar_icon_enabled: bool,
  pub always_on_top_enabled: bool,
  pub window_opacity_percent: u8,
  pub global_toggle_shortcut: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowControlRuntimeStateDto {
  pub global_shortcut_error: Option<String>,
  pub menu_bar_icon_error: Option<String>,
  pub window_preference_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockRestoreDto {
  pub id: String,
  pub kind: BlockKind,
  pub content: String,
  pub language: Option<String>,
  pub position: i64,
}

impl TryFrom<Block> for BlockDto {
  type Error = AppError;

  fn try_from(value: Block) -> Result<Self, Self::Error> {
    Ok(Self {
      id: value.id,
      document_id: value.document_id,
      kind: value.kind,
      position: value.position,
      content: value.content,
      language: value.language,
      created_at: value.created_at,
      updated_at: value.updated_at,
    })
  }
}

impl From<DocumentSummary> for DocumentSummaryDto {
  fn from(value: DocumentSummary) -> Self {
    Self {
      id: value.id,
      title: value.title,
      block_tint_override: value.block_tint_override,
      document_surface_tone_override: value.document_surface_tone_override,
      preview: value.preview,
      updated_at: value.updated_at,
      last_opened_at: value.last_opened_at,
      block_count: value.block_count,
    }
  }
}

impl DocumentDto {
  pub fn new(document: Document, preview: String, blocks: Vec<BlockDto>) -> Self {
    Self {
      id: document.id,
      title: document.title,
      block_tint_override: document.block_tint_override,
      document_surface_tone_override: document.document_surface_tone_override,
      preview,
      updated_at: document.updated_at,
      last_opened_at: document.last_opened_at,
      block_count: blocks.len(),
      blocks,
    }
  }
}

impl From<SearchResult> for SearchResultDto {
  fn from(value: SearchResult) -> Self {
    Self {
      summary: value.summary.into(),
      score: value.score,
    }
  }
}
