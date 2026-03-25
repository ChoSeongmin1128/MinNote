use crate::domain::models::{BlockKind, Document};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreBlockInput {
  pub id: String,
  pub kind: BlockKind,
  pub content: String,
  pub language: Option<String>,
  pub position: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteRestoreBlockInput {
  pub id: String,
  pub kind: BlockKind,
  pub content: String,
  pub language: Option<String>,
  pub position: i64,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct RemoteDocumentApplyOutcome {
  pub document: Document,
  pub applied: bool,
}
