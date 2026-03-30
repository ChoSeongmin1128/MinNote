import type { MutableRefObject } from 'react';
import {
  insertBlockNotePlainText,
  clearBlockNoteContent,
  deleteBlockNoteSelection,
  selectAllBlockNote,
  type BlockNoteEditorLike,
} from '../../lib/blocknoteBridge';
import type { BlockEditorHandle } from '../../lib/editorHandle';
import { createEmptyMarkdownBlocks } from './markdownBlockSchema';

interface MarkdownEditorHandleParams {
  editor: BlockNoteEditorLike;
  isWholeBlockSelectedRef: MutableRefObject<boolean>;
  hasUserEditedRef: MutableRefObject<boolean>;
  emitSelectionVisualState: () => void;
  getCurrentMarkdown: () => string;
}

export function createMarkdownEditorHandle({
  editor,
  isWholeBlockSelectedRef,
  hasUserEditedRef,
  emitSelectionVisualState,
  getCurrentMarkdown,
}: MarkdownEditorHandleParams): BlockEditorHandle {
  return {
    async cut() {
      const markdown = getCurrentMarkdown();
      if (isWholeBlockSelectedRef.current) {
        await navigator.clipboard.writeText(markdown);
        clearBlockNoteContent(editor, createEmptyMarkdownBlocks);
        isWholeBlockSelectedRef.current = false;
        emitSelectionVisualState();
        return true;
      }

      const selectedText = editor.getSelectedText();
      if (!selectedText) {
        return false;
      }

      await navigator.clipboard.writeText(selectedText);
      editor.focus();
      return deleteBlockNoteSelection(editor);
    },
    async copy() {
      if (isWholeBlockSelectedRef.current) {
        await navigator.clipboard.writeText(getCurrentMarkdown());
        return true;
      }

      const selectedText = editor.getSelectedText();
      if (!selectedText) {
        return false;
      }

      await navigator.clipboard.writeText(selectedText);
      return true;
    },
    async paste() {
      const text = await navigator.clipboard.readText();
      editor.focus();
      if (!text) {
        return false;
      }

      editor.pasteMarkdown(text);
      return true;
    },
    async pastePlainText() {
      const text = await navigator.clipboard.readText();
      editor.focus();
      if (!text) {
        return false;
      }

      isWholeBlockSelectedRef.current = false;
      emitSelectionVisualState();
      return insertBlockNotePlainText(editor, text);
    },
    selectAll() {
      selectAllBlockNote(editor);
      isWholeBlockSelectedRef.current = true;
      emitSelectionVisualState();
      return true;
    },
    canUndo() {
      return hasUserEditedRef.current && editor._tiptapEditor.can().undo();
    },
    undo() {
      editor._tiptapEditor.commands.undo();
    },
    canRedo() {
      return editor._tiptapEditor.can().redo();
    },
    redo() {
      editor._tiptapEditor.commands.redo();
    },
  };
}
