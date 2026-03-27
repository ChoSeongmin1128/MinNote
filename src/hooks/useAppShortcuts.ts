import { useEffect, useRef } from 'react';
import { useBlockController, useDocumentController } from '../app/controllers';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { resetHoldState } from '../lib/backspaceHoldState';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, [contenteditable="true"], [contenteditable=""], .cm-editor, .cm-content, .ProseMirror',
    ),
  );
}

export function useAppShortcuts() {
  const {
    copySelectedBlocks,
    deleteSelectedBlocks,
    isBlockClipboardText,
    pasteBlocks,
    undoBlockOperation,
    redoBlockOperation,
  } = useBlockController();
  const { flushCurrentDocument } = useDocumentController();
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const blockSelected = useDocumentSessionStore((state) => state.blockSelected);
  const allBlocksSelected = useDocumentSessionStore((state) => state.allBlocksSelected);
  const selectedBlockId = useDocumentSessionStore((state) => state.selectedBlockId);
  const selectedBlockIds = useDocumentSessionStore((state) => state.selectedBlockIds);
  const setBlockSelected = useDocumentSessionStore((state) => state.setBlockSelected);
  const setAllBlocksSelected = useDocumentSessionStore((state) => state.setAllBlocksSelected);

  const lastSelectAllRef = useRef(0);
  const selectAllStageRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!currentDocument) {
        return;
      }

      const hasBlockSelection =
        allBlocksSelected
        || selectedBlockIds.length > 0
        || (blockSelected && selectedBlockId != null);

      if ((event.key === 'Backspace' || event.key === 'Delete') && hasBlockSelection && !isEditableTarget(event.target)) {
        event.preventDefault();
        void deleteSelectedBlocks();
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) {
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flushCurrentDocument();
        return;
      }

      if (event.key.toLowerCase() === 'z') {
        const activeEditor = useDocumentSessionStore.getState().activeEditorRef?.current;
        if (event.shiftKey) {
          if (activeEditor?.canRedo()) {
            activeEditor.redo();
          } else {
            event.preventDefault();
            void redoBlockOperation();
          }
        } else {
          if (activeEditor?.canUndo()) {
            activeEditor.undo();
          } else {
            event.preventDefault();
            void undoBlockOperation();
          }
        }
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        const now = Date.now();
        const isContinuation = now - lastSelectAllRef.current < 700;
        lastSelectAllRef.current = now;

        if (!isContinuation) {
          // 1단계: 블록 내 텍스트 전체 선택 (에디터가 처리)
          selectAllStageRef.current = 1;
          return;
        }

        if (selectAllStageRef.current === 1) {
          // 2단계: 블록 자체 선택
          event.preventDefault();
          setBlockSelected(true);
          selectAllStageRef.current = 2;
          return;
        }

        if (selectAllStageRef.current === 2) {
          // 3단계: 전체 블록 선택
          event.preventDefault();
          setAllBlocksSelected(true);
          selectAllStageRef.current = 0;
          return;
        }

        return;
      }

      // 복사
      if (event.key.toLowerCase() === 'c') {
        if (hasBlockSelection) {
          event.preventDefault();
          void copySelectedBlocks();
        }
        return;
      }

      // 블록 선택 상태에서 잘라내기
      if (event.key.toLowerCase() === 'x' && hasBlockSelection) {
        event.preventDefault();
        void copySelectedBlocks().then(() => deleteSelectedBlocks());
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text || !isBlockClipboardText(text)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void pasteBlocks(text);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        resetHoldState();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [
    allBlocksSelected,
    blockSelected,
    currentDocument,
    selectedBlockId,
    selectedBlockIds.length,
    setAllBlocksSelected,
    setBlockSelected,
  ]);
}
