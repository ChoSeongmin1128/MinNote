use std::path::PathBuf;

use super::*;

fn test_db_path() -> PathBuf {
  std::env::temp_dir().join(format!("minnote-documents-test-{}.db", uuid::Uuid::new_v4()))
}

fn test_store() -> SqliteStore {
  SqliteStore::new(&test_db_path()).expect("test store should be created")
}

#[test]
fn create_document_builds_summary_from_shared_helper() {
  let mut store = test_store();

  let created = store
    .create_document(Some("리팩토링 문서".to_string()))
    .expect("document should be created");
  let documents = store.list_documents().expect("documents should load");

  assert_eq!(documents.len(), 1);
  assert_eq!(documents[0].id, created.id);
  assert_eq!(documents[0].title.as_deref(), Some("리팩토링 문서"));
  assert_eq!(documents[0].block_count, 1);
}

#[test]
fn mark_document_opened_updates_last_opened_without_mutating_updated_at() {
  let mut store = test_store();
  let created = store.create_document(Some("열기 테스트".to_string())).expect("document should be created");

  store.connection.execute(
    "UPDATE documents SET updated_at = 123, last_opened_at = 456 WHERE id = ?1",
    params![created.id],
  ).expect("timestamps should be seeded");

  let opened = store
    .mark_document_opened(&created.id)
    .expect("document should be marked opened");

  assert_eq!(opened.updated_at, 123);
  assert!(opened.last_opened_at >= 456);
}
