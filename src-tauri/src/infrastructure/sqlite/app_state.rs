use super::*;

impl AppStateRepository for SqliteStore {
  fn get_last_opened_document_id(&self) -> Result<Option<String>, AppError> {
    self.get_state_value("last_opened_document_id")
  }

  fn set_last_opened_document_id(&mut self, document_id: &str) -> Result<(), AppError> {
    self.set_state_value("last_opened_document_id", document_id)?;
    Ok(())
  }

  fn get_app_settings(&self) -> Result<AppSettings, AppError> {
    let theme_mode = self
      .get_state_value("theme_mode")?
      .map(|value| ThemeMode::from_str(&value))
      .unwrap_or(ThemeMode::System);
    let default_block_tint_preset = self
      .get_state_value("default_block_tint_preset")?
      .map(|value| BlockTintPreset::from_str(&value))
      .unwrap_or(BlockTintPreset::Mist);
    let icloud_sync_enabled = self
      .get_state_value("icloud_sync_enabled")?
      .map(|value| value == "true")
      .unwrap_or(false);
    let menu_bar_icon_enabled = self
      .get_state_value("menu_bar_icon_enabled")?
      .map(|value| value == "true")
      .unwrap_or(false);
    let default_block_kind = self
      .get_state_value("default_block_kind")?
      .map(|value| BlockKind::from_str(&value))
      .unwrap_or(BlockKind::Markdown);

    Ok(AppSettings {
      theme_mode,
      default_block_tint_preset,
      default_block_kind,
      icloud_sync_enabled,
      menu_bar_icon_enabled,
    })
  }

  fn set_theme_mode(&mut self, theme_mode: ThemeMode) -> Result<(), AppError> {
    self.set_state_value("theme_mode", theme_mode.as_str())?;
    Ok(())
  }

  fn set_default_block_tint_preset(&mut self, preset: BlockTintPreset) -> Result<(), AppError> {
    self.set_state_value("default_block_tint_preset", preset.as_str())?;
    Ok(())
  }

  fn set_icloud_sync_enabled(&mut self, enabled: bool) -> Result<(), AppError> {
    self.set_state_value("icloud_sync_enabled", if enabled { "true" } else { "false" })?;
    Ok(())
  }

  fn set_menu_bar_icon_enabled(&mut self, enabled: bool) -> Result<(), AppError> {
    self.set_state_value("menu_bar_icon_enabled", if enabled { "true" } else { "false" })?;
    Ok(())
  }

  fn set_default_block_kind(&mut self, kind: BlockKind) -> Result<(), AppError> {
    self.set_state_value("default_block_kind", kind.as_str())?;
    Ok(())
  }
}
