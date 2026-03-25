import { describe, expect, it, vi } from 'vitest';
import type { DocumentVm } from '../../models/document';
import type { WorkspaceBootstrapState } from '../../models/workspace';
import { createDocumentUseCases } from './documentUseCases';

function createPayload(defaultBlockKind: WorkspaceBootstrapState['defaultBlockKind']): WorkspaceBootstrapState {
  return {
    documents: [],
    trashDocuments: [],
    currentDocument: null,
    themeMode: 'light',
    defaultBlockTintPreset: 'mist',
    defaultDocumentSurfaceTonePreset: 'default',
    defaultBlockKind,
    icloudSyncEnabled: false,
    menuBarIconEnabled: false,
    alwaysOnTopEnabled: false,
    windowOpacityPercent: 100,
    globalToggleShortcut: 'Cmd+Shift+Space',
  };
}

function createSessionGateway(currentDocument: DocumentVm | null = null) {
  let current = currentDocument;

  return {
    getCurrentDocument: vi.fn(() => current),
    getSelectionState: vi.fn(() => ({
      selectedBlockId: null,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
    })),
    setCurrentDocument: vi.fn((document) => {
      current = document;
    }),
    setCurrentDocumentState: vi.fn(),
    setDocumentWithFocus: vi.fn(),
    clearBlockSelection: vi.fn(),
    requestBlockFocus: vi.fn(),
    clearActiveEditorRef: vi.fn(),
    setIsFlushing: vi.fn(),
  };
}

function createWorkspaceGateway() {
  return {
    setDocuments: vi.fn(),
    setTrashDocuments: vi.fn(),
    upsertDocumentSummary: vi.fn(),
    setSearchResults: vi.fn(),
    setSearchQuery: vi.fn(),
    setIsBootstrapping: vi.fn(),
    clearError: vi.fn(),
    setError: vi.fn(),
    setSettingsOpen: vi.fn(),
  };
}

function createPreferencesGateway() {
  return {
    setDefaultBlockTintPreset: vi.fn(),
    setDefaultDocumentSurfaceTonePreset: vi.fn(),
    setDefaultBlockKind: vi.fn(),
    setThemeMode: vi.fn(),
    setIcloudSyncEnabled: vi.fn(),
    getIcloudSyncStatus: vi.fn(() => ({ state: 'idle' as const, lastSyncAt: null, errorMessage: null })),
    setIcloudSyncStatus: vi.fn(),
    setMenuBarIconEnabled: vi.fn(),
    getAlwaysOnTopEnabled: vi.fn(() => false),
    setAlwaysOnTopEnabled: vi.fn(),
    getWindowOpacityPercent: vi.fn(() => 100),
    setWindowOpacityPercent: vi.fn(),
    getGlobalToggleShortcut: vi.fn(() => 'Cmd+Shift+Space'),
    setGlobalToggleShortcut: vi.fn(),
    getGlobalShortcutError: vi.fn(() => null),
    setGlobalShortcutError: vi.fn(),
  };
}

describe('document usecases', () => {
  it('syncs default block kind when deleting a document', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const documentSync = { clearDocumentSync: vi.fn(), flushDocumentSaves: vi.fn() };
    const useCases = createDocumentUseCases({
      backend: {
        deleteDocument: vi.fn(async () => createPayload('code')),
      } as never,
      documentSync: documentSync as never,
      history: { clear: vi.fn() } as never,
      preferences: preferences as never,
      session,
      syncMutation: { enqueue: vi.fn() },
      workspace,
    });

    await useCases.deleteDocument('doc-1');

    expect(documentSync.clearDocumentSync).toHaveBeenCalledWith('doc-1');
    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('code');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
  });

  it('keeps current document while still syncing default block kind during restore', async () => {
    const currentDocument = {
      id: 'current-doc',
      title: null,
      blockTintOverride: null,
      documentSurfaceToneOverride: null,
      preview: '',
      updatedAt: 1,
      lastOpenedAt: 1,
      blockCount: 1,
      blocks: [],
    } satisfies DocumentVm;
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway(currentDocument);
    const useCases = createDocumentUseCases({
      backend: {
        restoreDocumentFromTrash: vi.fn(async () => createPayload('text')),
      } as never,
      documentSync: { flushDocumentSaves: vi.fn() } as never,
      history: { clear: vi.fn() } as never,
      preferences: preferences as never,
      session,
      syncMutation: { enqueue: vi.fn() },
      workspace,
    });

    await useCases.restoreDocumentFromTrash('trash-doc');

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('text');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(session.setCurrentDocument).not.toHaveBeenCalled();
  });
});
