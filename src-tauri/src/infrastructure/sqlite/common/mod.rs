use std::time::{SystemTime, UNIX_EPOCH};

use super::*;

mod blocks;
mod document_pipeline;
mod legacy_markdown;
mod state_values;
mod titles;

pub(crate) enum DocumentTimestampTarget {
  UpdatedAt,
  LastOpenedAt,
}

pub(crate) use blocks::{map_block, BLOCK_COLUMNS};

impl SqliteStore {
  pub(crate) fn now() -> i64 {
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_millis() as i64)
      .unwrap_or(0)
  }

  pub(crate) fn new_id() -> String {
    Uuid::new_v4().to_string()
  }
}
