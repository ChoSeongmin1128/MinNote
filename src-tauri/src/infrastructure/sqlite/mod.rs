use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::models::{
  AppSettings, Block, BlockKind, BlockTintPreset, BodyFontFamily, CodeFontFamily, Document, DocumentSummary, DocumentSurfaceTonePreset, SearchResult, ThemeMode,
};
use crate::error::AppError;
use crate::ports::repositories::{AppStateRepository, BlockRepository, DocumentRepository};

mod app_state;
mod blocks;
mod common;
mod documents;
mod schema;
mod search;
pub(crate) mod sync;

const SEARCH_INDEX_TABLE: &str = "search_index";
const DEFAULT_THEME_MODE: &str = "system";
const DEFAULT_BLOCK_TINT_PRESET: &str = "mist";
const DEFAULT_DOCUMENT_SURFACE_TONE_PRESET: &str = "default";
const DEFAULT_BLOCK_KIND: &str = "markdown";
const DEFAULT_BODY_FONT_FAMILY: &str = "system-sans";
const DEFAULT_BODY_FONT_SIZE_PX: &str = "16";
const DEFAULT_CODE_FONT_FAMILY: &str = "system-mono";
const DEFAULT_CODE_FONT_SIZE_PX: &str = "14";
const DEFAULT_MENU_BAR_ICON_ENABLED: &str = "false";
const DEFAULT_ALWAYS_ON_TOP_ENABLED: &str = "false";
const DEFAULT_WINDOW_OPACITY_PERCENT: &str = "100";
const DEFAULT_GLOBAL_TOGGLE_SHORTCUT: &str = "Option+M";
const ICLOUD_SCOPE_PRIVATE: &str = "private";
const ICLOUD_ZONE_NAME: &str = "MinNoteZone";

pub struct SqliteStore {
  pub(crate) connection: Connection,
}

impl SqliteStore {
  pub fn new(path: &Path) -> Result<Self, AppError> {
    let connection = Connection::open(path)?;
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    let store = Self { connection };
    store.initialize()?;
    Ok(store)
  }
}
