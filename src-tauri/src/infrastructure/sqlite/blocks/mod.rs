use super::common::{map_block, BLOCK_COLUMNS};
use super::*;

#[cfg(test)]
mod tests;

impl BlockRepository for SqliteStore {
    fn list_blocks(&self, document_id: &str) -> Result<Vec<Block>, AppError> {
        let mut statement = self.connection.prepare(&format!(
            "SELECT {BLOCK_COLUMNS}
       FROM blocks WHERE document_id = ?1 ORDER BY position ASC"
        ))?;

        let blocks = statement
            .query_map(params![document_id], map_block)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(blocks)
    }

    fn create_block_below(
        &mut self,
        document_id: &str,
        after_block_id: Option<&str>,
        kind: BlockKind,
    ) -> Result<Vec<Block>, AppError> {
        let device_id = self.current_device_id()?;
        let transaction = self.connection.transaction()?;
        let mut ordered_ids = transaction
            .prepare("SELECT id FROM blocks WHERE document_id = ?1 ORDER BY position ASC")?
            .query_map(params![document_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        let target_index = match after_block_id {
            Some(block_id) => ordered_ids
                .iter()
                .position(|id| id == block_id)
                .map(|index| index + 1)
                .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))?,
            None => 0,
        };

        let temp_position = -(ordered_ids.len() as i64 + 1);
        let new_block = Self::insert_empty_block(&transaction, document_id, temp_position, kind)?;
        transaction.execute(
            "UPDATE blocks SET updated_by_device_id = ?1 WHERE id = ?2",
            params![device_id, new_block.id],
        )?;
        ordered_ids.insert(target_index, new_block.id.clone());
        let order_updated_at = Self::next_block_ordering_timestamp(&transaction, &ordered_ids)?;
        Self::rewrite_positions(&transaction, document_id, &ordered_ids)?;
        Self::touch_block_ordering_metadata(
            &transaction,
            &ordered_ids,
            order_updated_at,
            &device_id,
        )?;
        transaction.commit()?;

        self.finish_document_mutation(document_id)?;
        self.record_block_created(&new_block.id, document_id)?;
        self.list_blocks(document_id)
    }

    fn change_block_kind(&mut self, block_id: &str, kind: BlockKind) -> Result<Block, AppError> {
        let document_id = self.block_document_id(block_id)?;
        let now = Self::now();
        let device_id = self.current_device_id()?;
        let (content, search_text, language) = match kind {
            BlockKind::Markdown => (String::new(), String::new(), None),
            BlockKind::Code => (String::new(), String::new(), Some("plaintext".to_string())),
            BlockKind::Text => (String::new(), String::new(), None),
        };

        self.connection.execute(
      "UPDATE blocks SET kind = ?1, content = ?2, search_text = ?3, language = ?4, updated_at = ?5, updated_by_device_id = ?6 WHERE id = ?7",
      params![kind.as_str(), content, search_text, language, now, device_id, block_id],
    )?;
        self.finish_document_mutation(&document_id)?;
        self.record_block_kind_changed(block_id, &document_id)?;
        self.fetch_block(block_id)
    }

    fn move_block(
        &mut self,
        document_id: &str,
        block_id: &str,
        target_position: i64,
    ) -> Result<Vec<Block>, AppError> {
        let blocks = self.list_blocks(document_id)?;
        let current_index = blocks
            .iter()
            .position(|block| block.id == block_id)
            .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))?;

        let clamped_target =
            target_position.clamp(0, blocks.len().saturating_sub(1) as i64) as usize;
        if current_index == clamped_target {
            return Ok(blocks);
        }

        let device_id = self.current_device_id()?;
        let mut ordered_ids = blocks.into_iter().map(|block| block.id).collect::<Vec<_>>();
        let block_id = ordered_ids.remove(current_index);
        ordered_ids.insert(clamped_target, block_id.clone());

        let transaction = self.connection.transaction()?;
        let order_updated_at = Self::next_block_ordering_timestamp(&transaction, &ordered_ids)?;
        Self::rewrite_positions(&transaction, document_id, &ordered_ids)?;
        Self::touch_block_ordering_metadata(
            &transaction,
            &ordered_ids,
            order_updated_at,
            &device_id,
        )?;
        transaction.commit()?;

        self.finish_document_mutation(document_id)?;
        self.record_document_touch(document_id)?;
        self.record_document_ordering_updated(document_id)?;
        self.list_blocks(document_id)
    }

    fn delete_block(&mut self, block_id: &str) -> Result<String, AppError> {
        let document_id = self.block_document_id(block_id)?;
        let deleted_at = Self::now();
        self.connection
            .execute("DELETE FROM blocks WHERE id = ?1", params![block_id])?;

        let remaining = self.connection.query_row(
            "SELECT COUNT(*) FROM blocks WHERE document_id = ?1",
            params![document_id],
            |row| row.get::<_, i64>(0),
        )?;

        if remaining == 0 {
            self.create_empty_block(&document_id, 0, BlockKind::Markdown)?;
        }

        self.finish_document_structure_mutation(&document_id)?;
        self.record_block_deletion(block_id, &document_id, deleted_at)?;
        Ok(document_id)
    }

    fn update_markdown_block(
        &mut self,
        block_id: &str,
        content: String,
    ) -> Result<Block, AppError> {
        let document_id = self.block_document_id(block_id)?;
        let (normalized_content, search_text) = Self::normalize_markdown_storage(&content);
        let now = Self::now();
        let device_id = self.current_device_id()?;

        self.connection.execute(
      "UPDATE blocks SET content = ?1, search_text = ?2, updated_at = ?3, updated_by_device_id = ?4 WHERE id = ?5",
      params![normalized_content, search_text, now, device_id, block_id],
    )?;
        self.finish_document_mutation(&document_id)?;
        self.record_block_content_updated(block_id, &document_id)?;
        self.fetch_block(block_id)
    }

    fn update_code_block(
        &mut self,
        block_id: &str,
        content: String,
        language: Option<String>,
    ) -> Result<Block, AppError> {
        let document_id = self.block_document_id(block_id)?;
        let now = Self::now();
        let device_id = self.current_device_id()?;
        self.connection.execute(
      "UPDATE blocks SET content = ?1, search_text = ?2, language = ?3, updated_at = ?4, updated_by_device_id = ?5 WHERE id = ?6",
      params![content, content, language, now, device_id, block_id],
    )?;
        self.finish_document_mutation(&document_id)?;
        self.record_block_content_updated(block_id, &document_id)?;
        self.fetch_block(block_id)
    }

    fn update_text_block(&mut self, block_id: &str, content: String) -> Result<Block, AppError> {
        let document_id = self.block_document_id(block_id)?;
        let now = Self::now();
        let device_id = self.current_device_id()?;
        self.connection.execute(
      "UPDATE blocks SET content = ?1, search_text = ?2, language = NULL, updated_at = ?3, updated_by_device_id = ?4 WHERE id = ?5",
      params![content, content, now, device_id, block_id],
    )?;
        self.finish_document_mutation(&document_id)?;
        self.record_block_content_updated(block_id, &document_id)?;
        self.fetch_block(block_id)
    }

    fn restore_blocks(
        &mut self,
        document_id: &str,
        blocks: &[crate::ports::models::RestoreBlockInput],
    ) -> Result<Vec<Block>, AppError> {
        let now = Self::now();
        let device_id = self.current_device_id()?;
        let transaction = self.connection.transaction()?;

        transaction.execute(
            "DELETE FROM blocks WHERE document_id = ?1",
            params![document_id],
        )?;

        if blocks.is_empty() {
            Self::insert_empty_block(&transaction, document_id, 0, BlockKind::Markdown)?;
        } else {
            let mut ordered: Vec<_> = blocks.iter().collect();
            ordered.sort_by_key(|b| b.position);

            for (i, block) in ordered.iter().enumerate() {
                let (content, search_text) = match block.kind {
                    BlockKind::Markdown => {
                        let (c, s) = Self::normalize_markdown_storage(&block.content);
                        (c, s)
                    }
                    BlockKind::Code | BlockKind::Text => {
                        (block.content.clone(), block.content.clone())
                    }
                };

                transaction.execute(
          "INSERT INTO blocks (id, document_id, kind, position, content, search_text, language, created_at, updated_at, updated_by_device_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
          params![
            block.id,
            document_id,
            block.kind.as_str(),
            i as i64,
            content,
            search_text,
            block.language,
            now,
            now,
            device_id
          ],
        )?;
            }
        }

        transaction.commit()?;

        self.finish_document_mutation(document_id)?;
        self.record_document_touch(document_id)?;
        for block in self.list_blocks(document_id)? {
            self.record_block_created(&block.id, document_id)?;
        }
        self.record_document_ordering_updated(document_id)?;
        self.list_blocks(document_id)
    }
}
