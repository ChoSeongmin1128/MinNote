import { useEffect, useRef } from 'react';
import {
  copySelectedBlocks,
  copySingleBlock,
  deleteBlock,
  deleteSelectedBlocks,
  flushCurrentDocument,
  pasteBlocks,
} from '../controllers/appController';
import { useDocumentSessionStore } from '../stores/documentSessionStore';

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
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const blockSelected = useDocumentSessionStore((state) => state.blockSelected);
  const allBlocksSelected = useDocumentSessionStore((state) => state.allBlocksSelected);
  const selectedBlockId = useDocumentSessionStore((state) => state.selectedBlockId);
  const setBlockSelected = useDocumentSessionStore((state) => state.setBlockSelected);
  const setAllBlocksSelected = useDocumentSessionStore((state) => state.setAllBlocksSelected);

  const lastSelectAllRef = useRef(0);
  const selectAllStageRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!currentDocument) {
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && allBlocksSelected && !isEditableTarget(event.target)) {
        event.preventDefault();
        void deleteSelectedBlocks();
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && blockSelected && selectedBlockId && !isEditableTarget(event.target)) {
        event.preventDefault();
        void deleteBlock(selectedBlockId);
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

      // 블록 선택 상태에서 복사
      if (event.key.toLowerCase() === 'c' && (allBlocksSelected || blockSelected)) {
        event.preventDefault();
        if (allBlocksSelected) {
          void copySelectedBlocks();
        } else if (blockSelected && selectedBlockId) {
          void copySingleBlock(selectedBlockId);
        }
        return;
      }

      // 블록 선택 상태에서 잘라내기
      if (event.key.toLowerCase() === 'x' && (allBlocksSelected || blockSelected)) {
        event.preventDefault();
        if (allBlocksSelected) {
          void copySelectedBlocks().then(() => deleteSelectedBlocks());
        } else if (blockSelected && selectedBlockId) {
          void copySingleBlock(selectedBlockId).then(() => deleteBlock(selectedBlockId));
        }
        return;
      }

      // 붙여넣기 (블록 선택 상태에서만 블록 붙여넣기)
      if (event.key.toLowerCase() === 'v' && (allBlocksSelected || blockSelected)) {
        event.preventDefault();
        void pasteBlocks();
      }
    };

    const onBeforeUnload = () => {
      void flushCurrentDocument();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [allBlocksSelected, blockSelected, currentDocument, selectedBlockId, setAllBlocksSelected, setBlockSelected]);
}
