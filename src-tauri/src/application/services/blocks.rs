use crate::application::dto::{BlockDto, BlockRestoreDto, DocumentDto};
use crate::domain::models::BlockKind;
use crate::error::AppError;
use crate::ports::models::RestoreBlockInput;
use crate::ports::repositories::AppRepository;

use super::hydrate_document;

pub fn create_block_below(
  repository: &mut dyn AppRepository,
  document_id: &str,
  after_block_id: Option<&str>,
  kind: BlockKind,
) -> Result<DocumentDto, AppError> {
  repository.create_block_below(document_id, after_block_id, kind)?;
  hydrate_document(repository, document_id, None)
}

pub fn change_block_kind(
  repository: &mut dyn AppRepository,
  block_id: &str,
  kind: BlockKind,
) -> Result<BlockDto, AppError> {
  repository.change_block_kind(block_id, kind)?.try_into()
}

pub fn move_block(
  repository: &mut dyn AppRepository,
  document_id: &str,
  block_id: &str,
  target_position: i64,
) -> Result<DocumentDto, AppError> {
  repository.move_block(document_id, block_id, target_position)?;
  hydrate_document(repository, document_id, None)
}

pub fn delete_block(repository: &mut dyn AppRepository, block_id: &str) -> Result<DocumentDto, AppError> {
  let document_id = repository.delete_block(block_id)?;
  hydrate_document(repository, &document_id, None)
}

pub fn update_markdown_block(
  repository: &mut dyn AppRepository,
  block_id: &str,
  content: String,
) -> Result<BlockDto, AppError> {
  repository.update_markdown_block(block_id, content)?.try_into()
}

pub fn update_code_block(
  repository: &mut dyn AppRepository,
  block_id: &str,
  content: String,
  language: Option<String>,
) -> Result<BlockDto, AppError> {
  repository.update_code_block(block_id, content, language)?.try_into()
}

pub fn update_text_block(
  repository: &mut dyn AppRepository,
  block_id: &str,
  content: String,
) -> Result<BlockDto, AppError> {
  repository.update_text_block(block_id, content)?.try_into()
}

pub fn restore_document_blocks(
  repository: &mut dyn AppRepository,
  document_id: &str,
  blocks: Vec<BlockRestoreDto>,
) -> Result<DocumentDto, AppError> {
  let restore_inputs = blocks
    .into_iter()
    .map(|block| RestoreBlockInput {
      id: block.id,
      kind: block.kind,
      content: block.content,
      language: block.language,
      position: block.position,
    })
    .collect::<Vec<_>>();

  repository.restore_blocks(document_id, &restore_inputs)?;
  hydrate_document(repository, document_id, None)
}
