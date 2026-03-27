use crate::domain::models::BlockKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreBlockInput {
  pub id: String,
  pub kind: BlockKind,
  pub content: String,
  pub language: Option<String>,
  pub position: i64,
}
