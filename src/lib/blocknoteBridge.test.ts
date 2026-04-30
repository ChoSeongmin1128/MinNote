import { describe, expect, it, vi } from 'vitest';
import { nestBlockNote, replaceBlockNoteTaskShortcut, type BlockNoteEditorLike } from './blocknoteBridge';

type TestBlock = {
  id: string;
  type: string;
  content: Array<{ type: string; text: string; styles: Record<string, never> }>;
  children: TestBlock[];
};

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

  it('keeps Notion-like sibling depth when re-indenting a block with absorbed children', () => {
    const nestedSibling: TestBlock = {
      id: '2-c',
      type: 'paragraph',
      content: [{ type: 'text', text: '2-c', styles: {} }],
      children: [
        {
          id: '3-a',
          type: 'paragraph',
          content: [{ type: 'text', text: '3-a', styles: {} }],
          children: [],
        },
      ],
    };
    const currentBlock: TestBlock = {
      id: '2-b',
      type: 'paragraph',
      content: [{ type: 'text', text: '2-b', styles: {} }],
      children: [nestedSibling],
    };
    const rootBlock: TestBlock = {
      id: '1',
      type: 'paragraph',
      content: [{ type: 'text', text: '1', styles: {} }],
      children: [
        {
          id: '2-a',
          type: 'paragraph',
          content: [{ type: 'text', text: '2-a', styles: {} }],
          children: [],
        },
      ],
    };
    const editor = {
      document: [rootBlock, currentBlock],
      getTextCursorPosition: () => ({ block: { id: '2-b' } }),
      nestBlock: vi.fn(() => {
        editor.document = [{ ...rootBlock, children: [...rootBlock.children, currentBlock] }];
      }),
      removeBlocks: vi.fn((blocksToRemove: TestBlock[]) => {
        const idsToRemove = new Set(blocksToRemove.map((block) => block.id));
        currentBlock.children = currentBlock.children.filter((block) => !idsToRemove.has(block.id));
      }),
      insertBlocks: vi.fn((blocksToInsert: unknown[], referenceBlock: { id: string }) => {
        const parentChildren = editor.document[0].children;
        const referenceIndex = parentChildren.findIndex((block: TestBlock) => block.id === referenceBlock.id);
        parentChildren.splice(referenceIndex + 1, 0, ...(blocksToInsert as TestBlock[]));
      }),
    } as unknown as BlockNoteEditorLike;

    const nested = nestBlockNote(editor);

    expect(nested).toBe(true);
    expect(editor.nestBlock).toHaveBeenCalled();
    expect(editor.removeBlocks).toHaveBeenCalledWith([nestedSibling]);
    expect(editor.insertBlocks).toHaveBeenCalledWith([nestedSibling], currentBlock, 'after');
    expect(editor.document).toEqual([
      {
        ...rootBlock,
        children: [
          rootBlock.children[0],
          { ...currentBlock, children: [] },
          nestedSibling,
        ],
      },
    ]);
  });
});
