import type { MutableRefObject } from 'react';
import {
  canNestBlockNote,
  canUnnestBlockNote,
  isAtBlockNoteBoundary,
  isBlockNoteSelectionEmpty,
  nestBlockNote,
  replaceBlockNoteArrowShortcut,
  selectAllBlockNote,
  unnestBlockNote,
  type BlockNoteEditorLike,
} from '../../lib/blocknoteBridge';
import { shouldReplaceMarkdownArrow } from '../../lib/markdownEditorBehavior';
import { isMarkdownContentEmpty } from '../../lib/markdown';
import { scheduleBlockDeletion } from '../../lib/backspaceHoldState';
import type { BlockCaretPlacement } from '../../lib/types';

interface MarkdownKeydownParams {
  editor: BlockNoteEditorLike;
  isWholeBlockSelectedRef: MutableRefObject<boolean>;
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
        event.preventDefault();
        isWholeBlockSelectedRef.current = false;
        if (!event.repeat) {
          onDeleteIfEmpty();
          emitSelectionVisualState();
        } else {
          scheduleBlockDeletion(() => {
            onDeleteIfEmpty();
            emitSelectionVisualState();
          });
        }
      }
      return;
    }

    if (!isMeta && event.key === 'Tab') {
      const shouldUnnest = event.shiftKey;
      const supportsStructureIndent =
        typeof editor.canNestBlock === 'function'
        || typeof editor.canUnnestBlock === 'function';
      const canTransform = shouldUnnest ? canUnnestBlockNote(editor) : canNestBlockNote(editor);
      if (canTransform) {
        event.preventDefault();
        event.stopPropagation();
        isWholeBlockSelectedRef.current = false;
        if (shouldUnnest) {
          unnestBlockNote(editor);
        } else {
          nestBlockNote(editor);
        }
        emitSelectionVisualState();
        return;
      }

      isWholeBlockSelectedRef.current = false;
      emitSelectionVisualState();
      if (supportsStructureIndent) {
        event.preventDefault();
      }
      return;
    }

    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Tab') {
      isWholeBlockSelectedRef.current = false;
      emitSelectionVisualState();
    }
  };
}
