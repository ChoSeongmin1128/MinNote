use std::fs;
use std::path::{Path, PathBuf};

use crate::error::StartupError;

pub(crate) const LEGACY_BUNDLE_IDENTIFIER: &str = "com.seongmin.minnote";
pub(crate) const LEGACY_DATABASE_FILENAME: &str = "minnote.sqlite3";
pub(crate) const LEGACY_ICLOUD_CONTAINER_IDENTIFIER: &str = "iCloud.com.seongmin.minnote";
pub(crate) const LEGACY_ICLOUD_ZONE_NAME: &str = "MinNoteZone";
#[allow(dead_code)]
pub(crate) const LEGACY_ICLOUD_ZONE_SUBSCRIPTION_ID: &str = "minnote-zone-subscription";
pub(crate) const LEGACY_ICLOUD_SCOPE_PRIVATE: &str = "legacy_private";

pub(crate) struct LegacyLocalMigration {
    pub imported: bool,
    pub source_path: Option<PathBuf>,
}

fn legacy_app_dir_for(app_dir: &Path) -> Option<PathBuf> {
    app_dir
        .parent()
        .map(|parent| parent.join(LEGACY_BUNDLE_IDENTIFIER))
}

fn copy_if_exists(source: &Path, target: &Path) -> Result<(), StartupError> {
    if !source.exists() {
        return Ok(());
    }

    fs::copy(source, target).map_err(StartupError::MigrateLegacyData)?;
    Ok(())
}

pub(crate) fn migrate_legacy_local_database(
    app_dir: &Path,
    database_filename: &str,
) -> Result<LegacyLocalMigration, StartupError> {
    let target_db = app_dir.join(database_filename);
    if target_db.exists() {
        return Ok(LegacyLocalMigration {
            imported: false,
            source_path: None,
        });
    }

    let Some(legacy_app_dir) = legacy_app_dir_for(app_dir) else {
        return Ok(LegacyLocalMigration {
            imported: false,
            source_path: None,
        });
    };
    let legacy_db = legacy_app_dir.join(LEGACY_DATABASE_FILENAME);
    if !legacy_db.exists() {
        return Ok(LegacyLocalMigration {
            imported: false,
            source_path: None,
        });
    }

    fs::create_dir_all(app_dir).map_err(StartupError::PrepareAppDataDir)?;
    copy_if_exists(&legacy_db, &target_db)?;
    copy_if_exists(
        &legacy_app_dir.join(format!("{LEGACY_DATABASE_FILENAME}-wal")),
        &app_dir.join(format!("{database_filename}-wal")),
    )?;
    copy_if_exists(
        &legacy_app_dir.join(format!("{LEGACY_DATABASE_FILENAME}-shm")),
        &app_dir.join(format!("{database_filename}-shm")),
    )?;

    Ok(LegacyLocalMigration {
        imported: true,
        source_path: Some(legacy_db),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "madi-legacy-migration-test-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn copies_legacy_database_and_wal_files_when_target_is_missing() {
        let root = test_root();
        let app_dir = root.join("com.seongmin.madi");
        let legacy_dir = root.join(LEGACY_BUNDLE_IDENTIFIER);
        fs::create_dir_all(&legacy_dir).unwrap();
        fs::write(legacy_dir.join(LEGACY_DATABASE_FILENAME), b"db").unwrap();
        fs::write(legacy_dir.join(format!("{LEGACY_DATABASE_FILENAME}-wal")), b"wal").unwrap();
        fs::write(legacy_dir.join(format!("{LEGACY_DATABASE_FILENAME}-shm")), b"shm").unwrap();

        let result = migrate_legacy_local_database(&app_dir, "madi.sqlite3").unwrap();

        assert!(result.imported);
        assert_eq!(fs::read(app_dir.join("madi.sqlite3")).unwrap(), b"db");
        assert_eq!(fs::read(app_dir.join("madi.sqlite3-wal")).unwrap(), b"wal");
        assert_eq!(fs::read(app_dir.join("madi.sqlite3-shm")).unwrap(), b"shm");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_overwrite_existing_madi_database() {
        let root = test_root();
        let app_dir = root.join("com.seongmin.madi");
        let legacy_dir = root.join(LEGACY_BUNDLE_IDENTIFIER);
        fs::create_dir_all(&app_dir).unwrap();
        fs::create_dir_all(&legacy_dir).unwrap();
        fs::write(app_dir.join("madi.sqlite3"), b"current").unwrap();
        fs::write(legacy_dir.join(LEGACY_DATABASE_FILENAME), b"legacy").unwrap();

        let result = migrate_legacy_local_database(&app_dir, "madi.sqlite3").unwrap();

        assert!(!result.imported);
        assert_eq!(fs::read(app_dir.join("madi.sqlite3")).unwrap(), b"current");

        let _ = fs::remove_dir_all(root);
    }
}
