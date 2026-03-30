use super::*;

fn invalid_setting(name: &str, value: &str) -> AppError {
  AppError::validation(format!("저장된 {name} 설정이 손상되었습니다: {value}"))
}

fn parse_optional_enum<T>(
  value: Option<String>,
  name: &str,
  default: T,
  parse: impl FnOnce(&str) -> Result<T, AppError>,
) -> Result<T, AppError> {
  match value {
    None => Ok(default),
    Some(value) => parse(&value).map_err(|_| invalid_setting(name, &value)),
  }
}

fn parse_bool_setting(value: Option<String>, name: &str, default: bool) -> Result<bool, AppError> {
  match value.as_deref() {
    None => Ok(default),
    Some("true") => Ok(true),
    Some("false") => Ok(false),
    Some(other) => Err(invalid_setting(name, other)),
  }
}

fn parse_u8_setting(
  value: Option<String>,
  name: &str,
  default: u8,
  valid_range: std::ops::RangeInclusive<u8>,
) -> Result<u8, AppError> {
  match value {
    None => Ok(default),
    Some(value) => {
      let parsed = value.parse::<u8>().map_err(|_| invalid_setting(name, &value))?;
      if !valid_range.contains(&parsed) {
        return Err(invalid_setting(name, &value));
      }
      Ok(parsed)
    }
  }
}

impl AppStateRepository for SqliteStore {
  fn get_last_opened_document_id(&self) -> Result<Option<String>, AppError> {
    self.get_state_value("last_opened_document_id")
  }

  fn set_last_opened_document_id(&mut self, document_id: &str) -> Result<(), AppError> {
    self.set_state_value("last_opened_document_id", document_id)?;
    Ok(())
  }

  fn get_app_settings(&self) -> Result<AppSettings, AppError> {
    let theme_mode = parse_optional_enum(
      self.get_state_value("theme_mode")?,
      "테마",
      ThemeMode::System,
      ThemeMode::try_from_str,
    )?;
    let default_block_tint_preset = parse_optional_enum(
      self.get_state_value("default_block_tint_preset")?,
      "기본 블록 색상쌍",
      BlockTintPreset::Mist,
      BlockTintPreset::try_from_str,
    )?;
    let default_document_surface_tone_preset = parse_optional_enum(
      self.get_state_value("default_document_surface_tone_preset")?,
      "기본 문서 배경 톤",
      DocumentSurfaceTonePreset::Default,
      DocumentSurfaceTonePreset::try_from_str,
    )?;
    let menu_bar_icon_enabled = parse_bool_setting(
      self.get_state_value("menu_bar_icon_enabled")?,
      "메뉴바 아이콘",
      false,
    )?;
    let default_block_kind = parse_optional_enum(
      self.get_state_value("default_block_kind")?,
      "기본 블록 종류",
      BlockKind::Markdown,
      BlockKind::try_from_str,
    )?;
    let body_font_family = parse_optional_enum(
      self.get_state_value("body_font_family")?,
      "본문 글꼴",
      BodyFontFamily::SystemSans,
      BodyFontFamily::try_from_str,
    )?;
    let body_font_size_px = parse_u8_setting(
      self.get_state_value("body_font_size_px")?,
      "본문 글자 크기",
      16,
      14..=20,
    )?;
    let code_font_family = parse_optional_enum(
      self.get_state_value("code_font_family")?,
      "코드 글꼴",
      CodeFontFamily::SystemMono,
      CodeFontFamily::try_from_str,
    )?;
    let code_font_size_px = parse_u8_setting(
      self.get_state_value("code_font_size_px")?,
      "코드 글자 크기",
      14,
      12..=18,
    )?;
    let always_on_top_enabled = parse_bool_setting(
      self.get_state_value("always_on_top_enabled")?,
      "항상 위에 고정",
      false,
    )?;
    let window_opacity_percent = parse_u8_setting(
      self.get_state_value("window_opacity_percent")?,
      "창 투명도",
      100,
      50..=100,
    )?;
    let global_toggle_shortcut = self
      .get_state_value("global_toggle_shortcut")?
      .filter(|value| !value.trim().is_empty());

    Ok(AppSettings {
      theme_mode,
      default_block_tint_preset,
      default_document_surface_tone_preset,
      default_block_kind,
      body_font_family,
      body_font_size_px,
      code_font_family,
      code_font_size_px,
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

  fn set_body_font_family(&mut self, font_family: BodyFontFamily) -> Result<(), AppError> {
    self.set_state_value("body_font_family", font_family.as_str())?;
    Ok(())
  }

  fn set_body_font_size_px(&mut self, size: u8) -> Result<(), AppError> {
    self.set_state_value("body_font_size_px", &size.to_string())?;
    Ok(())
  }

  fn set_code_font_family(&mut self, font_family: CodeFontFamily) -> Result<(), AppError> {
    self.set_state_value("code_font_family", font_family.as_str())?;
    Ok(())
  }

  fn set_code_font_size_px(&mut self, size: u8) -> Result<(), AppError> {
    self.set_state_value("code_font_size_px", &size.to_string())?;
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

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  use super::*;

  fn test_db_path() -> PathBuf {
    std::env::temp_dir().join(format!("minnote-app-state-test-{}.db", uuid::Uuid::new_v4()))
  }

  fn test_store() -> SqliteStore {
    SqliteStore::new(&test_db_path()).expect("test store should be created")
  }

  #[test]
  fn invalid_theme_mode_returns_validation_error() {
    let store = test_store();
    store
      .set_state_value("theme_mode", "broken-theme")
      .expect("state value should be written");

    let error = store.get_app_settings().expect_err("invalid theme should fail");

    assert_eq!(
      error.to_string(),
      "저장된 테마 설정이 손상되었습니다: broken-theme",
    );
  }

  #[test]
  fn invalid_boolean_setting_returns_validation_error() {
    let store = test_store();
    store
      .set_state_value("menu_bar_icon_enabled", "maybe")
      .expect("state value should be written");

    let error = store.get_app_settings().expect_err("invalid bool should fail");

    assert_eq!(
      error.to_string(),
      "저장된 메뉴바 아이콘 설정이 손상되었습니다: maybe",
    );
  }

  #[test]
  fn invalid_body_font_family_returns_validation_error() {
    let store = test_store();
    store
      .set_state_value("body_font_family", "broken-font")
      .expect("state value should be written");

    let error = store.get_app_settings().expect_err("invalid body font should fail");

    assert_eq!(
      error.to_string(),
      "저장된 본문 글꼴 설정이 손상되었습니다: broken-font",
    );
  }

  #[test]
  fn invalid_code_font_size_returns_validation_error() {
    let store = test_store();
    store
      .set_state_value("code_font_size_px", "40")
      .expect("state value should be written");

    let error = store.get_app_settings().expect_err("invalid code font size should fail");

    assert_eq!(
      error.to_string(),
      "저장된 코드 글자 크기 설정이 손상되었습니다: 40",
    );
  }
}
