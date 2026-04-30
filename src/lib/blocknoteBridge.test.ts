import { describe, expect, it, vi } from 'vitest';
import { replaceBlockNoteTaskShortcut, type BlockNoteEditorLike } from './blocknoteBridge';

function createTaskShortcutEditor(beforeText: string, afterText = '') {
  const updateBlock = vi.fn();
  const focus = vi.fn();
  const setTextCursorPosition = vi.fn();
  const text = `${beforeText}${afterText}`;
  const editor = {
    _tiptapEditor: {
      state: {
        selection: {
          empty: true,
          $from: {
            parentOffset: beforeText.length,
            parent: {
              isTextblock: true,
              content: { size: text.length },
              textBetween(from: number, to: number) {
                return text.slice(from, to);
              },
            },
          },
        },
      },
    },
    updateBlock,
    focus,
    setTextCursorPosition,
    getTextCursorPosition: () => ({ block: { id: 'block-1' } }),
  } as unknown as BlockNoteEditorLike;

  return { editor, updateBlock, focus, setTextCursorPosition };
}

describe('blocknote bridge', () => {
  it('turns [] into an empty checklist item without inserting a space', () => {
    const { editor, updateBlock, focus, setTextCursorPosition } = createTaskShortcutEditor('[]');

    const replaced = replaceBlockNoteTaskShortcut(editor, (text) => text.trim() === '[]');

    expect(replaced).toBe(true);
    expect(updateBlock).toHaveBeenCalledWith(
      { id: 'block-1' },
      {
        type: 'checkListItem',
        content: [],
      },
    );
    expect(focus).toHaveBeenCalled();
    expect(setTextCursorPosition).toHaveBeenCalledWith('block-1', 'end');
  });

  it('does not replace [] when text already follows the cursor', () => {
    const { editor, updateBlock, focus, setTextCursorPosition } = createTaskShortcutEditor('[]', ' 내용');

    const replaced = replaceBlockNoteTaskShortcut(editor, (text) => text.trim() === '[]');

    expect(replaced).toBe(false);
    expect(updateBlock).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(setTextCursorPosition).not.toHaveBeenCalled();
  });
});
