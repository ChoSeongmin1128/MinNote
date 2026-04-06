import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentVm } from '../application/models/document';
import { useDocumentSessionStore } from './documentSessionStore';

function createDocument(): DocumentVm {
  return {
    id: 'doc-1',
    title: 'Test',
    blockTintOverride: null,
    documentSurfaceToneOverride: null,
    preview: '',
    updatedAt: 1,
    lastOpenedAt: 1,
    blockCount: 3,
    blocks: [
      {
        id: 'block-a',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 0,
        createdAt: 1,
        updatedAt: 1,
        content: 'A',
        language: null,
      },
      {
        id: 'block-b',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 1,
        createdAt: 1,
        updatedAt: 1,
        content: 'B',
        language: null,
      },
      {
        id: 'block-c',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 2,
        createdAt: 1,
        updatedAt: 1,
        content: 'C',
        language: null,
      },
    ],
  };
}

function resetStore() {
  useDocumentSessionStore.setState({
    currentDocument: null,
    selectedBlockId: null,
    selectedBlockIds: [],
    blockSelected: false,
    allBlocksSelected: false,
    isFlushing: false,
    saveInFlightCount: 0,
    saveError: null,
    lastSavedAt: null,
    lastLocalMutationAt: null,
    focusRequest: null,
    activeEditorRef: null,
  });
}

describe('documentSessionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('normalizes selectedBlockIds into document order and syncs the anchor state', () => {
    const document = createDocument();
    useDocumentSessionStore.getState().setCurrentDocument(document);

    useDocumentSessionStore.getState().setSelectedBlockIds(['block-c', 'block-a', 'block-c', 'missing']);

    expect(useDocumentSessionStore.getState().selectedBlockIds).toEqual(['block-a', 'block-c']);
    expect(useDocumentSessionStore.getState().selectedBlockId).toBe('block-a');
    expect(useDocumentSessionStore.getState().blockSelected).toBe(true);
    expect(useDocumentSessionStore.getState().allBlocksSelected).toBe(false);
  });

  it('clears subset selection when switching to single-block or all-block selection', () => {
    const document = createDocument();
    useDocumentSessionStore.getState().setCurrentDocument(document);
    useDocumentSessionStore.getState().setSelectedBlockIds(['block-b', 'block-c']);

    useDocumentSessionStore.getState().setBlockSelected(true);
    expect(useDocumentSessionStore.getState().selectedBlockIds).toEqual([]);
    expect(useDocumentSessionStore.getState().blockSelected).toBe(true);
    expect(useDocumentSessionStore.getState().allBlocksSelected).toBe(false);

    useDocumentSessionStore.getState().setSelectedBlockIds(['block-b', 'block-c']);
    useDocumentSessionStore.getState().setAllBlocksSelected(true);
    expect(useDocumentSessionStore.getState().selectedBlockIds).toEqual([]);
    expect(useDocumentSessionStore.getState().blockSelected).toBe(false);
    expect(useDocumentSessionStore.getState().allBlocksSelected).toBe(true);
  });
});
