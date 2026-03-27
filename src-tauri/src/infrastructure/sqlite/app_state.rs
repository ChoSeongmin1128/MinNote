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
      .map(|value| ThemeMode::try_from_str(&value))
      .transpose()?
      .unwrap_or(ThemeMode::System);
    let default_block_tint_preset = self
      .get_state_value("default_block_tint_preset")?
      .map(|value| BlockTintPreset::try_from_str(&value))
      .transpose()?
      .unwrap_or(BlockTintPreset::Mist);
    let default_document_surface_tone_preset = self
      .get_state_value("default_document_surface_tone_preset")?
      .map(|value| DocumentSurfaceTonePreset::try_from_str(&value))
      .transpose()?
      .unwrap_or(DocumentSurfaceTonePreset::Default);
    let menu_bar_icon_enabled = self
      .get_state_value("menu_bar_icon_enabled")?
      .map(|value| value == "true")
      .unwrap_or(false);
    let default_block_kind = self
      .get_state_value("default_block_kind")?
      .map(|value| BlockKind::try_from_str(&value))
      .transpose()?
      .unwrap_or(BlockKind::Markdown);
    let always_on_top_enabled = self
      .get_state_value("always_on_top_enabled")?
      .map(|value| value == "true")
      .unwrap_or(false);
    let window_opacity_percent = self
      .get_state_value("window_opacity_percent")?
      .and_then(|value| value.parse::<u8>().ok())
      .filter(|value| (50..=100).contains(value))
      .unwrap_or(100);
    let global_toggle_shortcut = self
      .get_state_value("global_toggle_shortcut")?
      .filter(|value| !value.trim().is_empty());

    Ok(AppSettings {
      theme_mode,
      default_block_tint_preset,
      default_document_surface_tone_preset,
      default_block_kind,
      menu_bar_icon_enabled,
      always_on_top_enabled,
      window_opacity_percent,
      global_toggle_shortcut,
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

  fn set_default_document_surface_tone_preset(
    &mut self,
    preset: DocumentSurfaceTonePreset,
  ) -> Result<(), AppError> {
    self.set_state_value("default_document_surface_tone_preset", preset.as_str())?;
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

  fn set_always_on_top_enabled(&mut self, enabled: bool) -> Result<(), AppError> {
    self.set_state_value("always_on_top_enabled", if enabled { "true" } else { "false" })?;
    Ok(())
  }

  fn set_window_opacity_percent(&mut self, percent: u8) -> Result<(), AppError> {
    self.set_state_value("window_opacity_percent", &percent.to_string())?;
    Ok(())
  }

  fn set_global_toggle_shortcut(&mut self, shortcut: Option<&str>) -> Result<(), AppError> {
    if let Some(shortcut) = shortcut {
      self.set_state_value("global_toggle_shortcut", shortcut)?;
    } else {
      self.set_state_value("global_toggle_shortcut", "")?;
    }

    Ok(())
  }
}
