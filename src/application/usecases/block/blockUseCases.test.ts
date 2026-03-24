import { describe, expect, it, vi } from 'vitest';
import type { DocumentVm } from '../../models/document';
import { createBlockUseCases } from './blockUseCases';

function createCurrentDocument(): DocumentVm {
  return {
    id: 'doc-1',
    title: null,
    blockTintOverride: null,
    documentSurfaceToneOverride: null,
    preview: '',
    updatedAt: 100,
    lastOpenedAt: 100,
    blockCount: 1,
    blocks: [
      {
        id: 'block-1',
        documentId: 'doc-1',
        kind: 'code',
        position: 0,
        content: 'console.log(1)',
        language: 'javascript',
        createdAt: 100,
        updatedAt: 100,
      },
    ],
  };
}

describe('block usecases', () => {
  it('normalizes null code language to plaintext when queueing a save', () => {
    const currentDocument = createCurrentDocument();
    const queued: unknown[] = [];
    const session = {
      getCurrentDocument: vi.fn(() => currentDocument),
      getSelectionState: vi.fn(() => ({
        selectedBlockId: null,
        selectedBlockIds: [],
        blockSelected: false,
        allBlocksSelected: false,
      })),
      setCurrentDocument: vi.fn(),
      setCurrentDocumentState: vi.fn(),
      setDocumentWithFocus: vi.fn(),
      clearBlockSelection: vi.fn(),
      requestBlockFocus: vi.fn(),
      clearActiveEditorRef: vi.fn(),
      setIsFlushing: vi.fn(),
    };
    const workspace = {
      upsertDocumentSummary: vi.fn(),
    };
    const useCases = createBlockUseCases({
      backend: {} as never,
      clipboard: {} as never,
      documentSync: {
        queueDocumentSave: vi.fn((...args) => {
          queued.push(args);
        }),
      } as never,
      flushCurrentDocument: vi.fn(),
      history: {} as never,
      session: session as never,
      syncMutation: {} as never,
      workspace: workspace as never,
    });

    useCases.updateCodeBlock('block-1', 'print(1)', null);

    expect(queued).toEqual([
      ['doc-1', 'block-1', { kind: 'code', content: 'print(1)', language: 'plaintext' }],
    ]);
    expect(session.setCurrentDocumentState).toHaveBeenCalled();
    expect(workspace.upsertDocumentSummary).toHaveBeenCalled();
  });
});
