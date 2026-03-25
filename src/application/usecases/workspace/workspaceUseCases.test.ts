import { describe, expect, it, vi } from 'vitest';
import type { DocumentSummaryVm, DocumentVm } from '../../models/document';
import type { WorkspaceBootstrapState } from '../../models/workspace';
import { createWorkspaceUseCases } from './workspaceUseCases';

function createPayload(defaultBlockKind: WorkspaceBootstrapState['defaultBlockKind']): WorkspaceBootstrapState {
  return {
    documents: [],
    trashDocuments: [],
    currentDocument: null,
    themeMode: 'dark',
    defaultBlockTintPreset: 'ocean-sand',
    defaultDocumentSurfaceTonePreset: 'default',
    defaultBlockKind,
    icloudSyncEnabled: true,
    menuBarIconEnabled: true,
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
    getIcloudSyncStatus: vi.fn(() => ({ state: 'idle' as const, lastSyncAt: 10, errorMessage: null })),
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

describe('workspace usecases', () => {
  it('applies default block kind during bootstrap', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const payload = createPayload('code');
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(async () => payload),
        getWindowControlRuntimeState: vi.fn(async () => ({ globalShortcutError: 'runtime error' })),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(),
        applyRemoteDocuments: vi.fn(),
      } as never,
      documentSync: { clearAllDocumentSync: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      syncMutation: { enqueue: vi.fn() },
      workspace,
    });

    await useCases.bootstrapApp();

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('code');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(preferences.setGlobalShortcutError).toHaveBeenCalledWith('runtime error');
    expect(workspace.setSearchResults).toHaveBeenCalledWith([]);
    expect(workspace.setSearchQuery).toHaveBeenCalledWith('');
  });

  it('keeps default block kind in deleteAllDocuments payload sync', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const payload = createPayload('text');
    const syncMutation = { enqueue: vi.fn() };
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(),
        getWindowControlRuntimeState: vi.fn(),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(async () => payload),
        applyRemoteDocuments: vi.fn(),
      } as never,
      documentSync: { clearAllDocumentSync: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      syncMutation,
      workspace,
    });

    await useCases.deleteAllDocuments();

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('text');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(workspace.setSettingsOpen).toHaveBeenCalledWith(false);
    expect(syncMutation.enqueue).toHaveBeenCalledWith({ kind: 'documents-reset' });
  });
});

describe('handleSyncEventMessage (remote-changed)', () => {
  function createDocument(id: string): DocumentVm {
    return {
      id,
      title: null,
      blockTintOverride: null,
      documentSurfaceToneOverride: null,
      preview: '',
      updatedAt: 0,
      lastOpenedAt: 0,
      blockCount: 0,
      blocks: [],
    };
  }

  function createSummary(id: string): DocumentSummaryVm {
    return {
      id,
      title: null,
      blockTintOverride: null,
      documentSurfaceToneOverride: null,
      preview: '',
      updatedAt: 0,
      lastOpenedAt: 0,
      blockCount: 0,
    };
  }

  function createUseCasesWithRemote(currentDocument: DocumentVm | null, payload: WorkspaceBootstrapState) {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway(currentDocument);
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(),
        getWindowControlRuntimeState: vi.fn(),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(),
        applyRemoteDocuments: vi.fn(async () => payload),
      } as never,
      documentSync: { clearAllDocumentSync: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      syncMutation: { enqueue: vi.fn() },
      workspace,
    });
    return { useCases, session };
  }

  it('clears current document when it is absent from a remote-changed payload', async () => {
    const currentDoc = createDocument('doc-1');
    const payload = { ...createPayload('markdown'), documents: [], currentDocument: null };
    const { useCases, session } = createUseCasesWithRemote(currentDoc, payload);

    await useCases.handleSyncEventMessage({ type: 'remote-changed', documents: [] });

    expect(session.setCurrentDocument).toHaveBeenCalledWith(null);
  });

  it('switches to next document when current is absent from a remote-changed payload', async () => {
    const currentDoc = createDocument('doc-1');
    const nextDoc = createDocument('doc-2');
    const payload = { ...createPayload('markdown'), documents: [createSummary('doc-2')], currentDocument: nextDoc };
    const { useCases, session } = createUseCasesWithRemote(currentDoc, payload);

    await useCases.handleSyncEventMessage({ type: 'remote-changed', documents: [] });

    expect(session.setCurrentDocument).toHaveBeenCalledWith(nextDoc);
  });

  it('does not change current document when it still exists in a remote-changed payload', async () => {
    const currentDoc = createDocument('doc-1');
    const payload = { ...createPayload('markdown'), documents: [createSummary('doc-1')], currentDocument: null };
    const { useCases, session } = createUseCasesWithRemote(currentDoc, payload);

    await useCases.handleSyncEventMessage({ type: 'remote-changed', documents: [] });

    expect(session.setCurrentDocument).not.toHaveBeenCalled();
  });
});
