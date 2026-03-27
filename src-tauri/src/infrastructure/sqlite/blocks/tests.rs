use std::path::PathBuf;

use super::*;

fn test_db_path() -> PathBuf {
  std::env::temp_dir().join(format!("minnote-blocks-test-{}.db", uuid::Uuid::new_v4()))
}

fn test_store() -> SqliteStore {
  SqliteStore::new(&test_db_path()).expect("test store should be created")
}

#[test]
fn move_block_keeps_positions_sequential() {
  let mut store = test_store();
  let document = store.create_document(Some("순서 테스트".to_string())).expect("document should be created");

  let blocks = store
    .create_block_below(&document.id, None, BlockKind::Text)
    .expect("second block should be created");
  let reordered = store
    .move_block(&document.id, &blocks[0].id, 1)
    .expect("block should move");

  let positions = reordered.into_iter().map(|block| block.position).collect::<Vec<_>>();
  assert_eq!(positions, vec![0, 1]);
}

#[test]
fn delete_block_rewrites_positions_after_structure_change() {
  let mut store = test_store();
  let document = store.create_document(Some("삭제 테스트".to_string())).expect("document should be created");

  let blocks = store
    .create_block_below(&document.id, None, BlockKind::Text)
    .expect("second block should be created");
  store
    .create_block_below(&document.id, Some(&blocks[0].id), BlockKind::Code)
    .expect("third block should be created");

  let middle_block_id = store
    .list_blocks(&document.id)
    .expect("blocks should load")[1]
    .id
    .clone();

  store.delete_block(&middle_block_id).expect("block should delete");

  let positions = store
    .list_blocks(&document.id)
    .expect("remaining blocks should load")
    .into_iter()
    .map(|block| block.position)
    .collect::<Vec<_>>();

  assert_eq!(positions, vec![0, 1]);
}
