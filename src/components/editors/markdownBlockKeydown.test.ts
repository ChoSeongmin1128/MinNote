import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { createMarkdownKeydownHandler } from './markdownBlockKeydown';
import type { BlockNoteEditorLike } from '../../lib/blocknoteBridge';

function createKeydownEditor() {
  const dispatch = vi.fn();
  const insertText = vi.fn(() => ({ scrollIntoView: vi.fn(() => 'transaction') }));
  const canUnnestBlock = vi.fn(() => false);
  const unnestBlock = vi.fn();
  const nestBlock = vi.fn();

  const editor = {
    _tiptapEditor: {
      state: {
        selection: { empty: true },
        tr: { insertText },
      },
      view: { dispatch },
    },
    canNestBlock: vi.fn(() => true),
    nestBlock,
    canUnnestBlock,
    unnestBlock,
  } as unknown as BlockNoteEditorLike;

  return { editor, dispatch, insertText, canUnnestBlock, unnestBlock, nestBlock };
}

function createEvent(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    metaKey: false,
    ctrlKey: false,
    repeat: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function createHandler(editor: BlockNoteEditorLike) {
  const isWholeBlockSelectedRef = { current: true } as MutableRefObject<boolean>;
  const emitSelectionVisualState = vi.fn();
  const handler = createMarkdownKeydownHandler({
    editor,
    isWholeBlockSelectedRef,
    emitSelectionVisualState,
    getCurrentMarkdown: () => 'content',
    onCreateBelow: vi.fn(),
    onNavigatePrevious: vi.fn(),
    onNavigateNext: vi.fn(),
    onDeleteIfEmpty: vi.fn(),
  });

  return { handler, isWholeBlockSelectedRef, emitSelectionVisualState };
}

describe('markdown block keydown', () => {
  it('uses Tab to create a nested BlockNote block without inserting plain spaces', () => {
    const { editor, dispatch, insertText, nestBlock } = createKeydownEditor();
    const { handler, isWholeBlockSelectedRef, emitSelectionVisualState } = createHandler(editor);
    const event = createEvent('Tab');

    handler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(nestBlock).toHaveBeenCalled();
    expect(insertText).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(isWholeBlockSelectedRef.current).toBe(false);
    expect(emitSelectionVisualState).toHaveBeenCalled();
  });

  it('uses Shift+Tab only to unnest an existing nested BlockNote block', () => {
    const { editor, insertText, canUnnestBlock, unnestBlock, nestBlock } = createKeydownEditor();
    canUnnestBlock.mockReturnValue(true);
    const { handler } = createHandler(editor);
    const event = createEvent('Tab', true);

    handler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(unnestBlock).toHaveBeenCalled();
    expect(insertText).not.toHaveBeenCalled();
    expect(nestBlock).not.toHaveBeenCalled();
  });
});
