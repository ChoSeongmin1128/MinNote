use super::*;

impl SqliteStore {
  pub(crate) fn normalize_markdown_storage(raw: &str) -> (String, String) {
    let normalized = raw.replace("\r\n", "\n");
    let search_text = Self::markdown_plain_text(&normalized);
    (normalized, search_text)
  }

  fn markdown_plain_text(markdown: &str) -> String {
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
}
