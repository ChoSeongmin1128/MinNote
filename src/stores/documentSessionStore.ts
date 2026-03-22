import { create } from 'zustand';
import type { DocumentVm } from '../adapters/documentAdapter';
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
  focusRequest: BlockFocusRequest | null;
  setCurrentDocument: (document: DocumentVm | null) => void;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedBlockIds: (blockIds: string[]) => void;
  setBlockSelected: (value: boolean) => void;
  setAllBlocksSelected: (value: boolean) => void;
  setIsFlushing: (value: boolean) => void;
  setLastSavedAt: (value: number | null) => void;
  requestBlockFocus: (blockId: string, caret: BlockCaretPlacement) => void;
  setFocusRequest: (focusRequest: BlockFocusRequest | null) => void;
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

export const useDocumentSessionStore = create<DocumentSessionState>((set, get) => ({
  currentDocument: null,
  selectedBlockId: null,
  selectedBlockIds: [],
  blockSelected: false,
  allBlocksSelected: false,
  isFlushing: false,
  lastSavedAt: null,
  focusRequest: null,
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
    }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId, selectedBlockIds: [], blockSelected: false, allBlocksSelected: false }),
  setSelectedBlockIds: (selectedBlockIds) => set({ selectedBlockIds, blockSelected: selectedBlockIds.length > 0, allBlocksSelected: false }),
  setBlockSelected: (blockSelected) => set({ blockSelected, allBlocksSelected: false }),
  setAllBlocksSelected: (allBlocksSelected) => set({ allBlocksSelected, selectedBlockIds: allBlocksSelected ? [] : get().selectedBlockIds }),
  setIsFlushing: (isFlushing) => set({ isFlushing }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  requestBlockFocus: (blockId, caret) =>
    set({
      selectedBlockId: blockId,
      selectedBlockIds: [],
      allBlocksSelected: false,
      focusRequest: createFocusRequest(blockId, caret),
    }),
  setFocusRequest: (focusRequest) => set({ focusRequest }),
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
      allBlocksSelected: false,
      focusRequest: createFocusRequest(target.id, caret),
    });
  },
}));
