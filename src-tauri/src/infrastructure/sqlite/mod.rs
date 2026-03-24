use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::models::{
  AppSettings, Block, BlockKind, BlockTintPreset, Document, DocumentSummary, DocumentSurfaceTonePreset, SearchResult, ThemeMode,
};
use crate::error::AppError;
use crate::ports::repositories::{AppStateRepository, BlockRepository, DocumentRepository, RemoteSyncRepository};

mod app_state;
mod blocks;
mod common;
mod documents;
mod remote_sync;
mod schema;
mod search;

const SEARCH_INDEX_TABLE: &str = "search_index";
const DEFAULT_THEME_MODE: &str = "system";
const DEFAULT_BLOCK_TINT_PRESET: &str = "mist";
const DEFAULT_DOCUMENT_SURFACE_TONE_PRESET: &str = "default";
const DEFAULT_ICLOUD_SYNC_ENABLED: &str = "false";

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
