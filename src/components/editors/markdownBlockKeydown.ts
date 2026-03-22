import type { MutableRefObject } from 'react';
import {
  isAtBlockNoteBoundary,
  isBlockNoteSelectionEmpty,
  replaceBlockNoteArrowShortcut,
  selectAllBlockNote,
  type BlockNoteEditorLike,
} from '../../lib/blocknoteBridge';
import { shouldReplaceMarkdownArrow } from '../../lib/markdownEditorBehavior';
import { isMarkdownContentEmpty } from '../../lib/markdown';
import type { BlockCaretPlacement } from '../../lib/types';

interface MarkdownKeydownParams {
  editor: BlockNoteEditorLike;
  isWholeBlockSelectedRef: MutableRefObject<boolean>;
  deleteReadyRef: MutableRefObject<boolean>;
  emitSelectionVisualState: () => void;
  getCurrentMarkdown: () => string;
  onCreateBelow: () => void;
  onNavigatePrevious: (caret: BlockCaretPlacement) => void;
  onNavigateNext: (caret: BlockCaretPlacement) => void;
  onDeleteIfEmpty: () => void;
}

export function createMarkdownKeydownHandler({
  editor,
  isWholeBlockSelectedRef,
  deleteReadyRef,
  emitSelectionVisualState,
  getCurrentMarkdown,
  onCreateBelow,
  onNavigatePrevious,
  onNavigateNext,
  onDeleteIfEmpty,
}: MarkdownKeydownParams) {
  return (event: KeyboardEvent) => {
    const isMeta = event.metaKey || event.ctrlKey;

    if (isMeta && event.key.toLowerCase() === 'a') {
      if (isWholeBlockSelectedRef.current) {
        return;
      }

      event.preventDefault();
      selectAllBlockNote(editor);
      isWholeBlockSelectedRef.current = true;
      emitSelectionVisualState();
      return;
    }

    if (isMeta && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      isWholeBlockSelectedRef.current = false;
      onCreateBelow();
      emitSelectionVisualState();
      return;
    }

    if (event.key === '>' && replaceBlockNoteArrowShortcut(editor, shouldReplaceMarkdownArrow)) {
      event.preventDefault();
      isWholeBlockSelectedRef.current = false;
      emitSelectionVisualState();
      return;
    }

    if (isMeta && event.key === 'ArrowUp') {
      event.preventDefault();
      isWholeBlockSelectedRef.current = false;
      onNavigatePrevious('end');
      emitSelectionVisualState();
      return;
    }

    if (isMeta && event.key === 'ArrowDown') {
      event.preventDefault();
      isWholeBlockSelectedRef.current = false;
      onNavigateNext('start');
      emitSelectionVisualState();
      return;
    }

    if (event.key === 'ArrowUp' && isAtBlockNoteBoundary(editor, 'start')) {
      event.preventDefault();
      isWholeBlockSelectedRef.current = false;
      onNavigatePrevious('end');
      emitSelectionVisualState();
      return;
    }

    if (event.key === 'ArrowDown' && isAtBlockNoteBoundary(editor, 'end')) {
      event.preventDefault();
      isWholeBlockSelectedRef.current = false;
      onNavigateNext('start');
      emitSelectionVisualState();
      return;
    }

    if (event.key === 'Backspace' && isMarkdownContentEmpty(getCurrentMarkdown())) {
      if (isBlockNoteSelectionEmpty(editor)) {
        if (editor.document.length <= 1) {
          if (deleteReadyRef.current) {
            event.preventDefault();
            isWholeBlockSelectedRef.current = false;
            deleteReadyRef.current = false;
            onDeleteIfEmpty();
            emitSelectionVisualState();
          } else {
            event.preventDefault();
            deleteReadyRef.current = true;
          }
        }
        // 빈 paragraph가 여러 개면 BlockNote가 자체적으로 병합하도록 허용
      }
      return;
    }

    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Tab') {
      isWholeBlockSelectedRef.current = false;
      deleteReadyRef.current = false;
      emitSelectionVisualState();
    }
  };
}
