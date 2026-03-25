use serde::{Deserialize, Serialize};

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

  pub fn from_str(value: &str) -> Self {
    match value {
      "code" => Self::Code,
      "text" => Self::Text,
      _ => Self::Markdown,
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

  pub fn from_str(value: &str) -> Self {
    match value {
      "sage-rose" => Self::SageRose,
      "sky-amber" => Self::SkyAmber,
      "mint-plum" => Self::MintPlum,
      "ocean-sand" => Self::OceanSand,
      "violet-lime" => Self::VioletLime,
      _ => Self::Mist,
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

  pub fn from_str(value: &str) -> Self {
    match value {
      "default" => Self::Default,
      "fog" => Self::Fog,
      "sand" => Self::Sand,
      "sage" => Self::Sage,
      "slate" => Self::Slate,
      "dusk" => Self::Dusk,
      _ => Self::Default,
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

  pub fn from_str(value: &str) -> Self {
    match value {
      "light" => Self::Light,
      "dark" => Self::Dark,
      _ => Self::System,
    }
  }
}

#[derive(Debug, Clone)]
pub struct Document {
  pub id: String,
  pub title: Option<String>,
  pub block_tint_override: Option<BlockTintPreset>,
  pub document_surface_tone_override: Option<DocumentSurfaceTonePreset>,
  pub created_at: i64,
  pub updated_at: i64,
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
  pub icloud_sync_enabled: bool,
  pub menu_bar_icon_enabled: bool,
  pub always_on_top_enabled: bool,
  pub window_opacity_percent: u8,
  pub global_toggle_shortcut: Option<String>,
}
