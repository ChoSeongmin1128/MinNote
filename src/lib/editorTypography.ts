import type { BodyFontFamily, CodeFontFamily } from './types';

interface EditorTypographyValues {
  bodyFontFamily: BodyFontFamily;
  bodyFontSizePx: number;
  codeFontFamily: CodeFontFamily;
  codeFontSizePx: number;
}

export const BODY_FONT_OPTIONS: Array<{ id: BodyFontFamily; label: string }> = [
  { id: 'system-sans', label: '시스템 산세리프' },
  { id: 'system-serif', label: '시스템 세리프' },
  { id: 'system-rounded', label: '시스템 라운드' },
];

export const CODE_FONT_OPTIONS: Array<{ id: CodeFontFamily; label: string }> = [
  { id: 'system-mono', label: '시스템 모노' },
  { id: 'sf-mono', label: 'SF Mono' },
  { id: 'menlo', label: 'Menlo' },
  { id: 'monaco', label: 'Monaco' },
];

export const MIN_BODY_FONT_SIZE_PX = 14;
export const MAX_BODY_FONT_SIZE_PX = 20;
export const DEFAULT_BODY_FONT_FAMILY: BodyFontFamily = 'system-sans';
export const DEFAULT_BODY_FONT_SIZE_PX = 16;

export const MIN_CODE_FONT_SIZE_PX = 12;
export const MAX_CODE_FONT_SIZE_PX = 18;
export const DEFAULT_CODE_FONT_FAMILY: CodeFontFamily = 'system-mono';
export const DEFAULT_CODE_FONT_SIZE_PX = 14;

export function getBodyFontLabel(fontFamily: BodyFontFamily) {
  return BODY_FONT_OPTIONS.find((option) => option.id === fontFamily)?.label ?? '시스템 산세리프';
}

export function getCodeFontLabel(fontFamily: CodeFontFamily) {
  return CODE_FONT_OPTIONS.find((option) => option.id === fontFamily)?.label ?? '시스템 모노';
}

export function getBodyFontStack(fontFamily: BodyFontFamily) {
  switch (fontFamily) {
    case 'system-serif':
      return "'New York', ui-serif, Georgia, serif";
    case 'system-rounded':
      return "'SF Pro Rounded', 'SF Pro Display', ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    case 'system-sans':
    default:
      return "'SF Pro Display', 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  }
}

export function getCodeFontStack(fontFamily: CodeFontFamily) {
  switch (fontFamily) {
    case 'sf-mono':
      return "'SF Mono', 'Menlo', 'Monaco', 'Cascadia Mono', 'Segoe UI Mono', monospace";
    case 'menlo':
      return "'Menlo', 'SF Mono', 'Monaco', 'Cascadia Mono', 'Segoe UI Mono', monospace";
    case 'monaco':
      return "'Monaco', 'SF Mono', 'Menlo', 'Cascadia Mono', 'Segoe UI Mono', monospace";
    case 'system-mono':
    default:
      return "ui-monospace, 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Mono', 'Segoe UI Mono', monospace";
  }
}

export function applyEditorTypographyCssVars(
  style: CSSStyleDeclaration,
  {
    bodyFontFamily,
    bodyFontSizePx,
    codeFontFamily,
    codeFontSizePx,
  }: EditorTypographyValues,
) {
  style.setProperty('--editor-body-font-family', getBodyFontStack(bodyFontFamily));
  style.setProperty('--editor-body-font-size', `${bodyFontSizePx}px`);
  style.setProperty('--editor-code-font-family', getCodeFontStack(codeFontFamily));
  style.setProperty('--editor-code-font-size', `${codeFontSizePx}px`);
}
