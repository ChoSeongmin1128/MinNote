use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlockKind {
  Markdown,
  Code,
  Text,
}

impl BlockKind {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Markdown => "markdown",
      Self::Code => "code",
      Self::Text => "text",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "markdown" => Ok(Self::Markdown),
      "code" => Ok(Self::Code),
      "text" => Ok(Self::Text),
      _ => Err(AppError::validation(format!("알 수 없는 블록 종류입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BlockTintPreset {
  Mist,
  SageRose,
  SkyAmber,
  MintPlum,
  OceanSand,
  VioletLime,
}

impl BlockTintPreset {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Mist => "mist",
      Self::SageRose => "sage-rose",
      Self::SkyAmber => "sky-amber",
      Self::MintPlum => "mint-plum",
      Self::OceanSand => "ocean-sand",
      Self::VioletLime => "violet-lime",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "mist" => Ok(Self::Mist),
      "sage-rose" => Ok(Self::SageRose),
      "sky-amber" => Ok(Self::SkyAmber),
      "mint-plum" => Ok(Self::MintPlum),
      "ocean-sand" => Ok(Self::OceanSand),
      "violet-lime" => Ok(Self::VioletLime),
      _ => Err(AppError::validation(format!("알 수 없는 블록 색상쌍입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DocumentSurfaceTonePreset {
  Default,
  Paper,
  Fog,
  Sand,
  Sage,
  Slate,
  Dusk,
}

impl DocumentSurfaceTonePreset {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Default => "default",
      Self::Paper => "paper",
      Self::Fog => "fog",
      Self::Sand => "sand",
      Self::Sage => "sage",
      Self::Slate => "slate",
      Self::Dusk => "dusk",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "default" => Ok(Self::Default),
      "paper" => Ok(Self::Paper),
      "fog" => Ok(Self::Fog),
      "sand" => Ok(Self::Sand),
      "sage" => Ok(Self::Sage),
      "slate" => Ok(Self::Slate),
      "dusk" => Ok(Self::Dusk),
      _ => Err(AppError::validation(format!("알 수 없는 문서 배경 톤입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
  System,
  Light,
  Dark,
}

impl ThemeMode {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::System => "system",
      Self::Light => "light",
      Self::Dark => "dark",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "system" => Ok(Self::System),
      "light" => Ok(Self::Light),
      "dark" => Ok(Self::Dark),
      _ => Err(AppError::validation(format!("알 수 없는 테마 모드입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BodyFontFamily {
  SystemSans,
  SystemSerif,
  SystemRounded,
}

impl BodyFontFamily {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::SystemSans => "system-sans",
      Self::SystemSerif => "system-serif",
      Self::SystemRounded => "system-rounded",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "system-sans" => Ok(Self::SystemSans),
      "system-serif" => Ok(Self::SystemSerif),
      "system-rounded" => Ok(Self::SystemRounded),
      _ => Err(AppError::validation(format!("알 수 없는 본문 글꼴입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CodeFontFamily {
  SystemMono,
  SfMono,
  Menlo,
  Monaco,
}

impl CodeFontFamily {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::SystemMono => "system-mono",
      Self::SfMono => "sf-mono",
      Self::Menlo => "menlo",
      Self::Monaco => "monaco",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "system-mono" => Ok(Self::SystemMono),
      "sf-mono" => Ok(Self::SfMono),
      "menlo" => Ok(Self::Menlo),
      "monaco" => Ok(Self::Monaco),
      _ => Err(AppError::validation(format!("알 수 없는 코드 글꼴입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ICloudSyncState {
  Disabled,
  Checking,
  Syncing,
  Idle,
  Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ICloudAccountStatus {
  Unknown,
  Available,
  NoAccount,
  Restricted,
  TemporarilyUnavailable,
  CouldNotDetermine,
}

impl ICloudAccountStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Unknown => "unknown",
      Self::Available => "available",
      Self::NoAccount => "no_account",
      Self::Restricted => "restricted",
      Self::TemporarilyUnavailable => "temporarily_unavailable",
      Self::CouldNotDetermine => "could_not_determine",
    }
  }

  pub fn try_from_str(value: &str) -> Result<Self, AppError> {
    match value {
      "unknown" => Ok(Self::Unknown),
      "available" => Ok(Self::Available),
      "no_account" => Ok(Self::NoAccount),
      "restricted" => Ok(Self::Restricted),
      "temporarily_unavailable" => Ok(Self::TemporarilyUnavailable),
      "could_not_determine" => Ok(Self::CouldNotDetermine),
      _ => Err(AppError::validation(format!("알 수 없는 iCloud 계정 상태입니다: {value}"))),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ICloudSyncStatus {
  pub enabled: bool,
  pub state: ICloudSyncState,
  pub account_status: ICloudAccountStatus,
  pub last_sync_started_at_ms: Option<i64>,
  pub last_sync_succeeded_at_ms: Option<i64>,
  pub last_error_code: Option<String>,
  pub last_error_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Document {
  pub id: String,
  pub title: Option<String>,
  pub block_tint_override: Option<BlockTintPreset>,
  pub document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  pub created_at: i64,
  pub updated_at: i64,
  pub updated_by_device_id: Option<String>,
  pub last_opened_at: i64,
  pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct Block {
  pub id: String,
  pub document_id: String,
  pub kind: BlockKind,
  pub position: i64,
  pub content: String,
  pub search_text: String,
  pub language: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
  pub updated_by_device_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DocumentSummary {
  pub id: String,
  pub title: Option<String>,
  pub block_tint_override: Option<BlockTintPreset>,
  pub document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  pub preview: String,
  pub updated_at: i64,
  pub last_opened_at: i64,
  pub block_count: usize,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
  pub summary: DocumentSummary,
  pub score: f64,
}

#[derive(Debug, Clone)]
pub struct AppSettings {
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
