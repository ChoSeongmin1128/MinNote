use crate::domain::models::{BlockKind, BlockTintPreset, BodyFontFamily, CodeFontFamily, DocumentSurfaceTonePreset, ThemeMode};
use crate::error::AppError;
use crate::ports::repositories::AppRepository;

pub fn set_theme_mode(repository: &mut dyn AppRepository, theme_mode: ThemeMode) -> Result<ThemeMode, AppError> {
  repository.set_theme_mode(theme_mode.clone())?;
  Ok(theme_mode)
}

pub fn set_default_block_tint_preset(
  repository: &mut dyn AppRepository,
  preset: BlockTintPreset,
) -> Result<BlockTintPreset, AppError> {
  repository.set_default_block_tint_preset(preset.clone())?;
  Ok(preset)
}

pub fn set_default_document_surface_tone_preset(
  repository: &mut dyn AppRepository,
  preset: DocumentSurfaceTonePreset,
) -> Result<DocumentSurfaceTonePreset, AppError> {
  repository.set_default_document_surface_tone_preset(preset.clone())?;
  Ok(preset)
}

pub fn set_default_block_kind(
  repository: &mut dyn AppRepository,
  kind: BlockKind,
) -> Result<BlockKind, AppError> {
  repository.set_default_block_kind(kind.clone())?;
  Ok(kind)
}

pub fn set_body_font_family(
  repository: &mut dyn AppRepository,
  font_family: BodyFontFamily,
) -> Result<BodyFontFamily, AppError> {
  repository.set_body_font_family(font_family.clone())?;
  Ok(font_family)
}

pub fn set_body_font_size_px(
  repository: &mut dyn AppRepository,
  size: u8,
) -> Result<u8, AppError> {
  if !(14..=20).contains(&size) {
    return Err(AppError::validation("본문 글자 크기는 14px에서 20px 사이여야 합니다."));
  }

  repository.set_body_font_size_px(size)?;
  Ok(size)
}

pub fn set_code_font_family(
  repository: &mut dyn AppRepository,
  font_family: CodeFontFamily,
) -> Result<CodeFontFamily, AppError> {
  repository.set_code_font_family(font_family.clone())?;
  Ok(font_family)
}

pub fn set_code_font_size_px(
  repository: &mut dyn AppRepository,
  size: u8,
) -> Result<u8, AppError> {
  if !(12..=18).contains(&size) {
    return Err(AppError::validation("코드 글자 크기는 12px에서 18px 사이여야 합니다."));
  }

  repository.set_code_font_size_px(size)?;
  Ok(size)
}

pub fn set_menu_bar_icon_enabled(
  repository: &mut dyn AppRepository,
  enabled: bool,
) -> Result<bool, AppError> {
  repository.set_menu_bar_icon_enabled(enabled)?;
  Ok(enabled)
}

pub fn set_always_on_top_enabled(
  repository: &mut dyn AppRepository,
  enabled: bool,
) -> Result<bool, AppError> {
  repository.set_always_on_top_enabled(enabled)?;
  Ok(enabled)
}

pub fn set_window_opacity_percent(
  repository: &mut dyn AppRepository,
  percent: u8,
) -> Result<u8, AppError> {
  if !(50..=100).contains(&percent) {
    return Err(AppError::validation("창 투명도는 50%에서 100% 사이여야 합니다."));
  }

  repository.set_window_opacity_percent(percent)?;
  Ok(percent)
}

pub fn set_global_toggle_shortcut(
  repository: &mut dyn AppRepository,
  shortcut: Option<String>,
) -> Result<Option<String>, AppError> {
  repository.set_global_toggle_shortcut(shortcut.as_deref())?;
  Ok(shortcut)
}
