use super::*;

pub(super) const DOCUMENT_COLUMNS: &str =
  "id, title, block_tint_override, document_surface_tone_override, created_at, updated_at, last_opened_at, deleted_at";

pub(super) fn map_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
  Ok(Document {
    id: row.get(0)?,
    title: row.get(1)?,
    block_tint_override: row
      .get::<_, Option<String>>(2)?
      .map(|value| BlockTintPreset::try_from_str(&value))
      .transpose()
      .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
    document_surface_tone_override: row
      .get::<_, Option<String>>(3)?
      .map(|value| DocumentSurfaceTonePreset::try_from_str(&value))
      .transpose()
      .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?,
    created_at: row.get(4)?,
    updated_at: row.get(5)?,
    last_opened_at: row.get(6)?,
    deleted_at: row.get(7)?,
  })
}
