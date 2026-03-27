use std::time::{SystemTime, UNIX_EPOCH};

use super::*;

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

  pub(crate) fn insert_empty_block(
    connection: &Connection,
    document_id: &str,
    position: i64,
    kind: BlockKind,
  ) -> Result<Block, AppError> {
    let now = Self::now();
    Self::insert_empty_block_with_timestamps(connection, document_id, position, kind, now, now)
  }

  pub(crate) fn insert_empty_block_with_timestamps(
    connection: &Connection,
    document_id: &str,
    position: i64,
    kind: BlockKind,
    created_at: i64,
    updated_at: i64,
  ) -> Result<Block, AppError> {
    let content = match kind {
      BlockKind::Markdown => String::new(),
      BlockKind::Code | BlockKind::Text => String::new(),
    };
    let language = matches!(kind, BlockKind::Code).then(|| "plaintext".to_string());
    let search_text = String::new();
    let block = Block {
      id: Self::new_id(),
      document_id: document_id.to_string(),
      kind,
      position,
      content,
      search_text,
      language,
      created_at,
      updated_at,
    };

    connection.execute(
      "INSERT INTO blocks (id, document_id, kind, position, content, search_text, language, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      params![
        block.id,
        block.document_id,
        block.kind.as_str(),
        block.position,
        block.content,
        block.search_text,
        block.language,
        block.created_at,
        block.updated_at
      ],
    )?;

    Ok(block)
  }

  pub(crate) fn create_empty_block(&self, document_id: &str, position: i64, kind: BlockKind) -> Result<Block, AppError> {
    Self::insert_empty_block(&self.connection, document_id, position, kind)
  }

  pub(crate) fn document_preview(&self, document_id: &str) -> Result<String, AppError> {
    let preview = self
      .connection
      .query_row(
        "SELECT search_text FROM blocks WHERE document_id = ?1 AND trim(search_text) != '' ORDER BY position LIMIT 1",
        params![document_id],
        |row| row.get::<_, String>(0),
      )
      .optional()?;

    Ok(preview.unwrap_or_default())
  }

  pub(crate) fn rewrite_positions(
    connection: &Connection,
    _document_id: &str,
    ordered_ids: &[String],
  ) -> Result<(), AppError> {
    let n = ordered_ids.len() as i64;

    // Phase 1: 모든 블록을 안전한 음수 범위 [-(n+1), -(2n)]로 이동 (충돌 불가)
    for (i, block_id) in ordered_ids.iter().enumerate() {
      connection.execute(
        "UPDATE blocks SET position = ?1 WHERE id = ?2",
        params![-(n + 1 + i as i64), block_id],
      )?;
    }

    // Phase 2: 최종 순차 포지션 할당 [0, n-1]
    for (i, block_id) in ordered_ids.iter().enumerate() {
      connection.execute(
        "UPDATE blocks SET position = ?1 WHERE id = ?2",
        params![i as i64, block_id],
      )?;
    }

    Ok(())
  }

  pub(crate) fn normalize_positions(&mut self, document_id: &str) -> Result<(), AppError> {
    let transaction = self.connection.transaction()?;
    let block_ids = transaction
      .prepare("SELECT id FROM blocks WHERE document_id = ?1 ORDER BY position ASC")?
      .query_map(params![document_id], |row| row.get::<_, String>(0))?
      .collect::<Result<Vec<_>, _>>()?;

    Self::rewrite_positions(&transaction, document_id, &block_ids)?;
    transaction.commit()?;
    Ok(())
  }

  pub(crate) fn touch_document_internal(&self, document_id: &str, update_opened_at: bool) -> Result<Document, AppError> {
    let now = Self::now();
    if update_opened_at {
      self.connection.execute(
        "UPDATE documents SET last_opened_at = ?1 WHERE id = ?2",
        params![now, document_id],
      )?;
    } else {
      self.connection.execute(
        "UPDATE documents SET updated_at = ?1 WHERE id = ?2",
        params![now, document_id],
      )?;
    }

    self.get_document(document_id)?
      .ok_or_else(|| AppError::validation("문서를 찾을 수 없습니다."))
  }

  pub(crate) fn finish_document_mutation(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.rebuild_search_index(document_id)?;
    self.touch_document_internal(document_id, false)
  }

  pub(crate) fn finish_document_structure_mutation(&mut self, document_id: &str) -> Result<Document, AppError> {
    self.normalize_positions(document_id)?;
    self.finish_document_mutation(document_id)
  }

  pub(crate) fn block_document_id(&self, block_id: &str) -> Result<String, AppError> {
    self.connection
      .query_row(
        "SELECT document_id FROM blocks WHERE id = ?1",
        params![block_id],
        |row| row.get::<_, String>(0),
      )
      .optional()?
      .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))
  }

  pub(crate) fn fetch_block(&self, block_id: &str) -> Result<Block, AppError> {
    self.connection
      .query_row(
        "SELECT id, document_id, kind, position, content, search_text, language, created_at, updated_at
         FROM blocks WHERE id = ?1",
        params![block_id],
        |row| {
          Ok(Block {
            id: row.get(0)?,
            document_id: row.get(1)?,
            kind: BlockKind::try_from_str(row.get::<_, String>(2)?.as_str())
              .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
            position: row.get(3)?,
            content: row.get(4)?,
            search_text: row.get(5)?,
            language: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
          })
        },
      )
      .optional()?
      .ok_or_else(|| AppError::validation("블록을 찾을 수 없습니다."))
  }

  pub(crate) fn normalize_markdown_storage(raw: &str) -> (String, String, bool) {
    let normalized_newlines = raw.replace("\r\n", "\n");
    if let Some(markdown) = Self::legacy_markdown_json_to_markdown(&normalized_newlines) {
      let search_text = Self::markdown_plain_text(&markdown);
      return (markdown, search_text, true);
    }

    let search_text = Self::markdown_plain_text(&normalized_newlines);
    (normalized_newlines, search_text, false)
  }

  pub(crate) fn markdown_plain_text(markdown: &str) -> String {
    markdown
      .lines()
      .map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("```") {
          return String::new();
        }

        let without_marker = if let Some(rest) = trimmed.strip_prefix("> ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("- [ ] ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("- [x] ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("- [X] ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("- ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("* ") {
          rest
        } else if let Some(rest) = trimmed.strip_prefix("+ ") {
          rest
        } else {
          let bytes = trimmed.as_bytes();
          let mut index = 0;
          while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
          }

          if index > 0 && index + 1 < bytes.len() && bytes[index] == b'.' && bytes[index + 1] == b' ' {
            &trimmed[(index + 2)..]
          } else {
            trimmed.trim_start_matches('#').trim()
          }
        };

        without_marker
          .replace("**", " ")
          .replace('*', " ")
          .replace("__", " ")
          .replace('_', " ")
          .replace("~~", " ")
          .replace('`', " ")
          .replace('[', " ")
          .replace(']', " ")
          .replace('(', " ")
          .replace(')', " ")
      })
      .flat_map(|line| line.split_whitespace().map(str::to_string).collect::<Vec<_>>())
      .collect::<Vec<_>>()
      .join(" ")
  }

  fn legacy_markdown_json_to_markdown(raw: &str) -> Option<String> {
    let value: Value = serde_json::from_str(raw).ok()?;
    let node_type = value
      .as_object()
      .and_then(|map| map.get("type"))
      .and_then(Value::as_str);

    if node_type != Some("doc") {
      return None;
    }

    Some(Self::serialize_legacy_markdown_node(&value, "").trim().to_string())
  }

  fn serialize_legacy_markdown_inline(node: &Value) -> String {
    match node {
      Value::String(text) => text.to_string(),
      Value::Object(map) => {
        let node_type = map.get("type").and_then(Value::as_str);

        if node_type == Some("text") {
          let mut text = map.get("text").and_then(Value::as_str).unwrap_or_default().to_string();

          if let Some(marks) = map.get("marks").and_then(Value::as_array) {
            for mark in marks {
              let mark_type = mark.get("type").and_then(Value::as_str);
              text = match mark_type {
                Some("bold") => format!("**{text}**"),
                Some("italic") => format!("*{text}*"),
                Some("strike") => format!("~~{text}~~"),
                Some("code") => format!("`{text}`"),
                _ => text,
              };
            }
          }

          return text;
        }

        if node_type == Some("hardBreak") {
          return "  \n".to_string();
        }

        map.get("content")
          .and_then(Value::as_array)
          .map(|content| content.iter().map(Self::serialize_legacy_markdown_inline).collect::<String>())
          .unwrap_or_default()
      }
      Value::Array(values) => values
        .iter()
        .map(Self::serialize_legacy_markdown_inline)
        .collect::<String>(),
      _ => String::new(),
    }
  }

  fn legacy_indent_lines(text: &str, indent: &str) -> String {
    text
      .lines()
      .map(|line| {
        if line.is_empty() {
          indent.trim_end().to_string()
        } else {
          format!("{indent}{line}")
        }
      })
      .collect::<Vec<_>>()
      .join("\n")
  }

  fn serialize_legacy_list_item_node(node: &Value, prefix: &str, indent: &str) -> String {
    let nested_indent = format!("{indent}  ");
    let parts = node
      .get("content")
      .and_then(Value::as_array)
      .map(|content| {
        content
          .iter()
          .enumerate()
          .map(|(index, child)| Self::serialize_legacy_markdown_node(child, if index == 0 { "" } else { &nested_indent }))
          .filter(|part| !part.trim().is_empty())
          .collect::<Vec<_>>()
      })
      .unwrap_or_default();

    if parts.is_empty() {
      return format!("{indent}{prefix}").trim_end().to_string();
    }

    let first = parts[0].clone();
    let rest = parts[1..].to_vec();
    let mut first_lines = first.lines();
    let head = format!("{indent}{prefix}{}", first_lines.next().unwrap_or_default());
    let mut lines = vec![head];
    lines.extend(first_lines.map(|line| format!("{nested_indent}{line}")));
    lines.extend(rest);
    lines.join("\n")
  }

  fn serialize_legacy_markdown_node(node: &Value, indent: &str) -> String {
    let Some(map) = node.as_object() else {
      return match node {
        Value::String(text) => text.to_string(),
        Value::Array(values) => values
          .iter()
          .map(|value| Self::serialize_legacy_markdown_node(value, indent))
          .filter(|part| !part.trim().is_empty())
          .collect::<Vec<_>>()
          .join("\n\n"),
        _ => String::new(),
      };
    };

    let node_type = map.get("type").and_then(Value::as_str);
    let content = map.get("content").and_then(Value::as_array).cloned().unwrap_or_default();

    match node_type {
      Some("doc") => content
        .iter()
        .map(|child| Self::serialize_legacy_markdown_node(child, indent))
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string(),
      Some("paragraph") => format!(
        "{indent}{}",
        content.iter().map(Self::serialize_legacy_markdown_inline).collect::<String>()
      )
      .trim_end()
      .to_string(),
      Some("heading") => {
        let level = map
          .get("attrs")
          .and_then(Value::as_object)
          .and_then(|attrs| attrs.get("level"))
          .and_then(Value::as_i64)
          .unwrap_or(1)
          .clamp(1, 6) as usize;

        format!(
          "{indent}{} {}",
          "#".repeat(level),
          content.iter().map(Self::serialize_legacy_markdown_inline).collect::<String>()
        )
        .trim_end()
        .to_string()
      }
      Some("bulletList") => content
        .iter()
        .map(|child| Self::serialize_legacy_list_item_node(child, "- ", indent))
        .collect::<Vec<_>>()
        .join("\n"),
      Some("orderedList") => {
        let start = map
          .get("attrs")
          .and_then(Value::as_object)
          .and_then(|attrs| attrs.get("start"))
          .and_then(Value::as_i64)
          .unwrap_or(1);

        content
          .iter()
          .enumerate()
          .map(|(index, child)| {
            Self::serialize_legacy_list_item_node(child, &format!("{}. ", start + index as i64), indent)
          })
          .collect::<Vec<_>>()
          .join("\n")
      }
      Some("taskList") => content
        .iter()
        .map(|child| {
          let checked = child
            .get("attrs")
            .and_then(Value::as_object)
            .and_then(|attrs| attrs.get("checked"))
            .and_then(Value::as_bool)
            .unwrap_or(false);

          Self::serialize_legacy_list_item_node(child, if checked { "- [x] " } else { "- [ ] " }, indent)
        })
        .collect::<Vec<_>>()
        .join("\n"),
      Some("listItem") | Some("taskItem") => Self::serialize_legacy_list_item_node(node, "- ", indent),
      Some("blockquote") => {
        let quoted = content
          .iter()
          .map(|child| Self::serialize_legacy_markdown_node(child, ""))
          .filter(|part| !part.trim().is_empty())
          .collect::<Vec<_>>()
          .join("\n\n");
        Self::legacy_indent_lines(&quoted, &format!("{indent}> "))
      }
      Some("codeBlock") => {
        let language = map
          .get("attrs")
          .and_then(Value::as_object)
          .and_then(|attrs| attrs.get("language"))
          .and_then(Value::as_str)
          .unwrap_or_default();
        let body = content
          .iter()
          .map(Self::serialize_legacy_markdown_inline)
          .collect::<String>()
          .trim_end_matches('\n')
          .to_string();
        format!("{indent}```{language}\n{body}\n{indent}```")
      }
      Some("horizontalRule") => format!("{indent}---"),
      _ => content
        .iter()
        .map(|child| Self::serialize_legacy_markdown_node(child, indent))
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n"),
    }
  }

  fn normalize_document_title(title: Option<String>) -> String {
    let trimmed = title.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
      return "Untitled".to_string();
    }

    trimmed
  }

  fn title_exists(&self, title: &str, excluded_document_id: Option<&str>) -> Result<bool, AppError> {
    let exists = match excluded_document_id {
      Some(document_id) => self
        .connection
        .query_row(
          "SELECT EXISTS(SELECT 1 FROM documents WHERE title = ?1 AND id != ?2 AND deleted_at IS NULL)",
          params![title, document_id],
          |row| row.get::<_, i64>(0),
        )?,
      None => self
        .connection
        .query_row(
          "SELECT EXISTS(SELECT 1 FROM documents WHERE title = ?1 AND deleted_at IS NULL)",
          params![title],
          |row| row.get::<_, i64>(0),
        )?,
    };

    Ok(exists > 0)
  }

  pub(crate) fn unique_document_title(
    &self,
    title: Option<String>,
    excluded_document_id: Option<&str>,
  ) -> Result<String, AppError> {
    let base = Self::normalize_document_title(title);
    if !self.title_exists(&base, excluded_document_id)? {
      return Ok(base);
    }

    let mut suffix = 1;
    loop {
      let candidate = format!("{base} ({suffix})");
      if !self.title_exists(&candidate, excluded_document_id)? {
        return Ok(candidate);
      }
      suffix += 1;
    }
  }

  pub(crate) fn get_state_value(&self, key: &str) -> Result<Option<String>, AppError> {
    self.connection
      .query_row(
        "SELECT value FROM app_state WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
      )
      .optional()
      .map_err(AppError::from)
  }

  pub(crate) fn set_state_value(&self, key: &str, value: &str) -> Result<(), AppError> {
    self.connection.execute(
      "INSERT INTO app_state (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![key, value],
    )?;
    Ok(())
  }
}
