export const DEFAULT_GLOBAL_TOGGLE_SHORTCUT = 'Cmd+Shift+Space';
export const MIN_WINDOW_OPACITY_PERCENT = 50;
export const MAX_WINDOW_OPACITY_PERCENT = 100;

const MODIFIER_CODES = new Set([
  'MetaLeft',
  'MetaRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
]);

function normalizeMainKey(code: string) {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }

  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }

  switch (code) {
    case 'Space':
      return 'Space';
    case 'Enter':
      return 'Enter';
    case 'Tab':
      return 'Tab';
    case 'Escape':
      return 'Escape';
    case 'Backquote':
      return 'Backquote';
    case 'Minus':
      return 'Minus';
    case 'Equal':
      return 'Equal';
    case 'BracketLeft':
      return 'BracketLeft';
    case 'BracketRight':
      return 'BracketRight';
    case 'Backslash':
      return 'Backslash';
    case 'Semicolon':
      return 'Semicolon';
    case 'Quote':
      return 'Quote';
    case 'Comma':
      return 'Comma';
    case 'Period':
      return 'Period';
    case 'Slash':
      return 'Slash';
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    default:
      return null;
  }
}

function formatShortcutToken(token: string) {
  switch (token) {
    case 'Cmd':
    case 'Command':
    case 'Super':
      return '⌘';
    case 'Ctrl':
    case 'Control':
      return '⌃';
    case 'Option':
    case 'Alt':
      return '⌥';
    case 'Shift':
      return '⇧';
    case 'Space':
      return 'Space';
    case 'Backquote':
      return '`';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Backslash':
      return '\\';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    default:
      return token.replace(/^Key/, '').replace(/^Digit/, '');
  }
}

export function keyboardEventToAccelerator(event: KeyboardEvent) {
  if (MODIFIER_CODES.has(event.code)) {
    return null;
  }

  const mainKey = normalizeMainKey(event.code);
  if (!mainKey) {
    return null;
  }

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push('Cmd');
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Option');
  if (event.shiftKey) modifiers.push('Shift');

  if (modifiers.length === 0) {
    return null;
  }

  return [...modifiers, mainKey].join('+');
}

export function formatShortcutDisplay(shortcut: string | null) {
  if (!shortcut) {
    return '사용 안 함';
  }

  return shortcut
    .split('+')
    .map((token) => formatShortcutToken(token.trim()))
    .join(' ');
}
