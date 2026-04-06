import type { SessionGateway } from '../application/ports/sessionGateway';
import type { BlockCaretPlacement } from '../lib/types';
import { useDocumentSessionStore } from '../stores/documentSessionStore';

function createFocusRequest(blockId: string, caret: BlockCaretPlacement) {
  return {
    blockId,
    caret,
    nonce: Date.now() + Math.random(),
  };
}

export const sessionGateway: SessionGateway = {
  getCurrentDocument() {
    return useDocumentSessionStore.getState().currentDocument;
  },
  hasUnsavedLocalChanges() {
    const state = useDocumentSessionStore.getState();
    if (state.isFlushing) {
      return true;
    }
    if (state.lastLocalMutationAt == null) {
      return false;
    }
    return (state.lastSavedAt ?? 0) < state.lastLocalMutationAt;
  },
  getSelectionState() {
    const state = useDocumentSessionStore.getState();
    return {
      selectedBlockId: state.selectedBlockId,
      selectedBlockIds: state.selectedBlockIds,
      blockSelected: state.blockSelected,
      allBlocksSelected: state.allBlocksSelected,
    };
  },
  setCurrentDocument(document) {
    if (!document) {
      useDocumentSessionStore.setState({
        currentDocument: null,
        selectedBlockId: null,
        selectedBlockIds: [],
        blockSelected: false,
        allBlocksSelected: false,
        focusRequest: null,
        lastSavedAt: null,
        lastLocalMutationAt: null,
      });
      return;
    }

    useDocumentSessionStore.getState().setCurrentDocument(document);
  },
  setCurrentDocumentState(document) {
    const state = useDocumentSessionStore.getState();
    const blockIds = new Set(document.blocks.map((b) => b.id));
    const normalizedSelectedBlockId =
      state.selectedBlockId && blockIds.has(state.selectedBlockId) ? state.selectedBlockId : null;
    const normalizedSelectedBlockIds = state.selectedBlockIds.filter((id) => blockIds.has(id));

    useDocumentSessionStore.setState({
      currentDocument: document,
      lastSavedAt: document.updatedAt,
      selectedBlockId: normalizedSelectedBlockId,
      selectedBlockIds: normalizedSelectedBlockIds,
      blockSelected: normalizedSelectedBlockId !== null ? state.blockSelected : false,
      allBlocksSelected: state.allBlocksSelected,
    });
  },
  setDocumentWithFocus(document, focusBlockId, caret = 'start') {
    const targetBlock = focusBlockId
      ? document.blocks.find((block) => block.id === focusBlockId) ?? document.blocks[0]
      : document.blocks[0];

    useDocumentSessionStore.setState({
      currentDocument: document,
      selectedBlockId: targetBlock?.id ?? null,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      focusRequest: targetBlock ? createFocusRequest(targetBlock.id, caret) : null,
      lastSavedAt: document.updatedAt,
    });
  },
  clearBlockSelection(clearActiveEditorRef = false) {
    useDocumentSessionStore.setState({
      selectedBlockId: null,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      activeEditorRef: clearActiveEditorRef ? null : useDocumentSessionStore.getState().activeEditorRef,
    });
  },
  requestBlockFocus(blockId, caret) {
    useDocumentSessionStore.getState().requestBlockFocus(blockId, caret);
  },
  clearActiveEditorRef() {
    useDocumentSessionStore.getState().setActiveEditorRef(null);
  },
  setIsFlushing(value) {
    useDocumentSessionStore.getState().setIsFlushing(value);
  },
  markLocalMutation(value) {
    useDocumentSessionStore.getState().markLocalMutation(value);
  },
};
