import { create } from 'zustand';
import type { DocumentVm } from '../application/models/document';
import type { BlockEditorHandle } from '../lib/editorHandle';
import type { CodeLanguageId } from '../lib/codeLanguageRegistry';
import type { BlockCaretPlacement } from '../lib/types';

export interface BlockFocusRequest {
  blockId: string;
  caret: BlockCaretPlacement;
  nonce: number;
}

interface DocumentSessionState {
  currentDocument: DocumentVm | null;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  blockSelected: boolean;
  allBlocksSelected: boolean;
  isFlushing: boolean;
  lastSavedAt: number | null;
  lastLocalMutationAt: number | null;
  lastCodeLanguage: CodeLanguageId;
  focusRequest: BlockFocusRequest | null;
  activeEditorRef: { current: BlockEditorHandle | null } | null;
  setCurrentDocument: (document: DocumentVm | null) => void;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedBlockIds: (blockIds: string[]) => void;
  setBlockSelected: (value: boolean) => void;
  setAllBlocksSelected: (value: boolean) => void;
  setIsFlushing: (value: boolean) => void;
  setLastSavedAt: (value: number | null) => void;
  markLocalMutation: (value?: number) => void;
  setLastCodeLanguage: (language: CodeLanguageId) => void;
  requestBlockFocus: (blockId: string, caret: BlockCaretPlacement) => void;
  setFocusRequest: (focusRequest: BlockFocusRequest | null) => void;
  setActiveEditorRef: (ref: { current: BlockEditorHandle | null } | null) => void;
  focusPreviousBlock: (fromBlockId: string, caret?: BlockCaretPlacement) => void;
  focusNextBlock: (fromBlockId: string, caret?: BlockCaretPlacement) => void;
}

function createFocusRequest(blockId: string, caret: BlockCaretPlacement): BlockFocusRequest {
  return {
    blockId,
    caret,
    nonce: Date.now() + Math.random(),
  };
}

function normalizeSelectedBlockIds(document: DocumentVm | null, blockIds: string[]) {
  if (!document) {
    return [];
  }

  const requestedIds = new Set(blockIds);
  return document.blocks
    .map((block) => block.id)
    .filter((blockId) => requestedIds.has(blockId));
}

export const useDocumentSessionStore = create<DocumentSessionState>((set, get) => ({
  currentDocument: null,
  selectedBlockId: null,
  selectedBlockIds: [],
  blockSelected: false,
  allBlocksSelected: false,
  isFlushing: false,
  lastSavedAt: null,
  lastLocalMutationAt: null,
  lastCodeLanguage: 'javascript',
  focusRequest: null,
  activeEditorRef: null,
  setCurrentDocument: (currentDocument) =>
    set({
      currentDocument,
      selectedBlockId: currentDocument?.blocks[0]?.id ?? null,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      focusRequest: currentDocument?.blocks[0]
        ? createFocusRequest(currentDocument.blocks[0].id, 'start')
        : null,
      lastSavedAt: currentDocument?.updatedAt ?? null,
      lastLocalMutationAt: null,
    }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId, selectedBlockIds: [], blockSelected: false, allBlocksSelected: false }),
  setSelectedBlockIds: (blockIds) => {
    const normalizedIds = normalizeSelectedBlockIds(get().currentDocument, blockIds);
    set({
      selectedBlockId: normalizedIds[0] ?? null,
      selectedBlockIds: normalizedIds,
      blockSelected: normalizedIds.length > 0,
      allBlocksSelected: false,
    });
  },
  setBlockSelected: (blockSelected) =>
    set({
      blockSelected,
      selectedBlockIds: blockSelected ? [] : get().selectedBlockIds,
      allBlocksSelected: false,
    }),
  setAllBlocksSelected: (allBlocksSelected) =>
    set({
      allBlocksSelected,
      selectedBlockIds: allBlocksSelected ? [] : get().selectedBlockIds,
      blockSelected: allBlocksSelected ? false : get().blockSelected,
    }),
  setIsFlushing: (isFlushing) => set({ isFlushing }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  markLocalMutation: (lastLocalMutationAt = Date.now()) => set({ lastLocalMutationAt }),
  setLastCodeLanguage: (lastCodeLanguage) => set({ lastCodeLanguage }),
  requestBlockFocus: (blockId, caret) =>
    set({
      selectedBlockId: blockId,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      focusRequest: createFocusRequest(blockId, caret),
    }),
  setFocusRequest: (focusRequest) => set({ focusRequest }),
  setActiveEditorRef: (activeEditorRef) => set({ activeEditorRef }),
  focusPreviousBlock: (fromBlockId, caret = 'end') => {
    const currentDocument = get().currentDocument;
    if (!currentDocument) {
      return;
    }

    const fromIndex = currentDocument.blocks.findIndex((block) => block.id === fromBlockId);
    if (fromIndex <= 0) {
      return;
    }

    const target = currentDocument.blocks[fromIndex - 1];
    set({
      selectedBlockId: target.id,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      focusRequest: createFocusRequest(target.id, caret),
    });
  },
  focusNextBlock: (fromBlockId, caret = 'start') => {
    const currentDocument = get().currentDocument;
    if (!currentDocument) {
      return;
    }

    const fromIndex = currentDocument.blocks.findIndex((block) => block.id === fromBlockId);
    if (fromIndex < 0 || fromIndex >= currentDocument.blocks.length - 1) {
      return;
    }

    const target = currentDocument.blocks[fromIndex + 1];
    set({
      selectedBlockId: target.id,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      focusRequest: createFocusRequest(target.id, caret),
    });
  },
}));
