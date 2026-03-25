import { describe, expect, it } from 'vitest';
import {
  formatShortcutDisplay,
  keyboardEventToAccelerator,
} from './globalShortcut';

describe('globalShortcut', () => {
  it('parses modifier + key keyboard events into accelerator strings', () => {
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      metaKey: true,
      shiftKey: true,
    });

    expect(keyboardEventToAccelerator(event)).toBe('Cmd+Shift+Space');
  });

  it('rejects pure modifier input', () => {
    const event = new KeyboardEvent('keydown', {
      code: 'ShiftLeft',
      shiftKey: true,
    });

    expect(keyboardEventToAccelerator(event)).toBeNull();
  });

  it('formats accelerators for display', () => {
    expect(formatShortcutDisplay('Cmd+Shift+Space')).toBe('⌘ ⇧ Space');
    expect(formatShortcutDisplay(null)).toBe('사용 안 함');
  });
});
