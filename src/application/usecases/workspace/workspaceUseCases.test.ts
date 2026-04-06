import { describe, expect, it, vi } from 'vitest';
import type { DocumentVm } from '../../models/document';
import type { WorkspaceBootstrapState } from '../../models/workspace';
import type { BackendPort } from '../../ports/backendPort';
import type { WorkspaceDocumentsChangedEvent } from '../../../lib/types';
import { createWorkspaceUseCases } from './workspaceUseCases';

function createPayload(defaultBlockKind: WorkspaceBootstrapState['defaultBlockKind']): WorkspaceBootstrapState {
  return {
    documents: [],
    trashDocuments: [],
    currentDocument: null,
    icloudSyncStatus: {
      enabled: false,
      state: 'disabled',
      accountStatus: 'unknown',
      pendingOperationCount: 0,
      lastSyncStartedAtMs: null,
      lastSyncSucceededAtMs: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    themeMode: 'dark',
    defaultBlockTintPreset: 'ocean-sand',
    defaultDocumentSurfaceTonePreset: 'default',
    defaultBlockKind,
    bodyFontFamily: 'system-sans',
    bodyFontSizePx: 16,
    codeFontFamily: 'system-mono',
    codeFontSizePx: 14,
    menuBarIconEnabled: true,
    alwaysOnTopEnabled: false,
    windowOpacityPercent: 100,
    globalToggleShortcut: 'Option+M',
    globalShortcutError: 'runtime error',
    menuBarIconError: 'tray error',
    windowPreferenceError: 'window error',
  };
}

function createSessionGateway(currentDocument: DocumentVm | null = null) {
  let current = currentDocument;

  return {
    getCurrentDocument: vi.fn(() => current),
    hasUnsavedLocalChanges: vi.fn(() => false),
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
    markLocalMutation: vi.fn(),
  };
}

function createWorkspaceGateway() {
  return {
    setDocuments: vi.fn(),
    setTrashDocuments: vi.fn(),
    setSyncNotice: vi.fn(),
    upsertDocumentSummary: vi.fn(),
    setSearchResults: vi.fn(),
    setSearchQuery: vi.fn(),
    setIsBootstrapping: vi.fn(),
    clearError: vi.fn(),
    setError: vi.fn(),
  };
}

function createDocumentsChangedEvent(
  overrides: Partial<WorkspaceDocumentsChangedEvent> = {},
): WorkspaceDocumentsChangedEvent {
  return {
    affectedDocumentIds: [],
    documentsChanged: true,
    trashChanged: false,
    currentDocumentMayBeStale: false,
    ...overrides,
  };
}

function createUiGateway() {
  return {
    setSettingsOpen: vi.fn(),
  };
}

function createPreferencesGateway() {
  return {
    setDefaultBlockTintPreset: vi.fn(),
    setDefaultDocumentSurfaceTonePreset: vi.fn(),
    setDefaultBlockKind: vi.fn(),
    setBodyFontFamily: vi.fn(),
    setBodyFontSizePx: vi.fn(),
    setCodeFontFamily: vi.fn(),
    setCodeFontSizePx: vi.fn(),
    setThemeMode: vi.fn(),
    setMenuBarIconEnabled: vi.fn(),
    getAlwaysOnTopEnabled: vi.fn(() => false),
    setAlwaysOnTopEnabled: vi.fn(),
    getWindowOpacityPercent: vi.fn(() => 100),
    setWindowOpacityPercent: vi.fn(),
    getGlobalToggleShortcut: vi.fn(() => 'Option+M'),
    setGlobalToggleShortcut: vi.fn(),
    getGlobalShortcutError: vi.fn(() => null),
    setGlobalShortcutError: vi.fn(),
    getMenuBarIconError: vi.fn(() => null),
    setMenuBarIconError: vi.fn(),
    getWindowPreferenceError: vi.fn(() => null),
    setWindowPreferenceError: vi.fn(),
    getICloudSyncStatus: vi.fn(() => ({
      enabled: false,
      state: 'disabled',
      accountStatus: 'unknown',
      pendingOperationCount: 0,
      lastSyncStartedAtMs: null,
      lastSyncSucceededAtMs: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })),
    setICloudSyncStatus: vi.fn(),
  };
}

describe('workspace usecases', () => {
  it('applies default block kind during bootstrap', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const payload = createPayload('code');
    const ui = createUiGateway();
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(async () => payload),
        listDocuments: vi.fn(),
        listTrashDocuments: vi.fn(),
        getWindowControlRuntimeState: vi.fn(),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(),
      } as never,
      editorPersistence: { clearAll: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.bootstrapApp();

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('code');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(preferences.setGlobalShortcutError).toHaveBeenCalledWith('runtime error');
    expect(preferences.setMenuBarIconError).toHaveBeenCalledWith('tray error');
    expect(preferences.setWindowPreferenceError).toHaveBeenCalledWith('window error');
    expect(workspace.setSearchResults).toHaveBeenCalledWith([]);
    expect(workspace.setSearchQuery).toHaveBeenCalledWith('');
  });

  it('normalizes storage bootstrap failures to a user-facing message', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const ui = createUiGateway();
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(async () => {
          throw new Error('database error: malformed');
        }),
        listDocuments: vi.fn(),
        listTrashDocuments: vi.fn(),
        getWindowControlRuntimeState: vi.fn(),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(),
      } as never,
      editorPersistence: { clearAll: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.bootstrapApp();

    expect(workspace.setError).toHaveBeenCalledWith('저장소를 읽지 못했습니다. 앱을 다시 실행해 주세요.');
    expect(workspace.setIsBootstrapping).toHaveBeenLastCalledWith(false);
  });

  it('keeps default block kind in deleteAllDocuments payload sync', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const payload = createPayload('text');
    const editorPersistence = { clearAll: vi.fn() };
    const ui = createUiGateway();
    const useCases = createWorkspaceUseCases({
      backend: {
        bootstrapApp: vi.fn(),
        listDocuments: vi.fn(),
        listTrashDocuments: vi.fn(),
        getWindowControlRuntimeState: vi.fn(),
        searchDocuments: vi.fn(),
        deleteAllDocuments: vi.fn(async () => payload),
      } as never,
      editorPersistence: editorPersistence as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.deleteAllDocuments();

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('text');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(ui.setSettingsOpen).toHaveBeenCalledWith(false);
    expect(editorPersistence.clearAll).toHaveBeenCalledTimes(1);
  });

  it('refreshes document lists after sync without full bootstrap', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const ui = createUiGateway();
    const documents = [
      {
        id: 'doc-1',
        title: '문서',
        blockTintOverride: null,
        documentSurfaceToneOverride: null,
        preview: '내용',
        updatedAt: 10,
        lastOpenedAt: 10,
        blockCount: 1,
      },
    ];
    const trashDocuments = [
      {
        id: 'trash-1',
        title: '휴지통 문서',
        blockTintOverride: null,
        documentSurfaceToneOverride: null,
        preview: '',
        updatedAt: 9,
        lastOpenedAt: 9,
        blockCount: 1,
      },
    ];
    const backend = {
      bootstrapApp: vi.fn(),
      listDocuments: vi.fn(async () => documents),
      listTrashDocuments: vi.fn(async () => trashDocuments),
      getWindowControlRuntimeState: vi.fn(),
      searchDocuments: vi.fn(),
      deleteAllDocuments: vi.fn(),
      openDocument: vi.fn(),
    } as unknown as BackendPort;
    const useCases = createWorkspaceUseCases({
      backend,
      editorPersistence: { clearAll: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.refreshWorkspaceDocumentsAfterSync(createDocumentsChangedEvent());

    expect(backend.listDocuments).toHaveBeenCalledTimes(1);
    expect(backend.listTrashDocuments).toHaveBeenCalledTimes(1);
    expect(workspace.setDocuments).toHaveBeenCalledWith(documents);
    expect(workspace.setTrashDocuments).toHaveBeenCalledWith(trashDocuments);
  });

  it('reopens current document only when affected and there are no unsaved local changes', async () => {
    const currentDocument = {
      id: 'doc-1',
      title: '현재 문서',
      blockTintOverride: null,
      documentSurfaceToneOverride: null,
      preview: '내용',
      updatedAt: 1,
      lastOpenedAt: 1,
      blockCount: 1,
      blocks: [
        {
          id: 'block-1',
          documentId: 'doc-1',
          kind: 'markdown' as const,
          position: 0,
          content: '내용',
          language: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const refreshedDocument = {
      ...currentDocument,
      updatedAt: 2,
    };
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway(currentDocument);
    const ui = createUiGateway();
    const backend = {
      bootstrapApp: vi.fn(),
      listDocuments: vi.fn(async () => [
        {
          id: 'doc-1',
          title: '현재 문서',
          blockTintOverride: null,
          documentSurfaceToneOverride: null,
          preview: '내용',
          updatedAt: 2,
          lastOpenedAt: 2,
          blockCount: 1,
        },
      ]),
      listTrashDocuments: vi.fn(async () => []),
      getWindowControlRuntimeState: vi.fn(),
      searchDocuments: vi.fn(),
      deleteAllDocuments: vi.fn(),
      openDocument: vi.fn(async () => refreshedDocument),
    } as unknown as BackendPort;
    const useCases = createWorkspaceUseCases({
      backend,
      editorPersistence: { clearAll: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.refreshWorkspaceDocumentsAfterSync(
      createDocumentsChangedEvent({
        affectedDocumentIds: ['doc-1'],
      }),
    );

    expect(backend.openDocument).toHaveBeenCalledWith('doc-1');
    expect(session.setCurrentDocumentState).toHaveBeenCalledWith(refreshedDocument);
    expect(workspace.setSyncNotice).toHaveBeenLastCalledWith(null);
  });

  it('keeps current document and shows notice when remote change arrives during unsaved local edits', async () => {
    const currentDocument = {
      id: 'doc-1',
      title: '현재 문서',
      blockTintOverride: null,
      documentSurfaceToneOverride: null,
      preview: '내용',
      updatedAt: 1,
      lastOpenedAt: 1,
      blockCount: 1,
      blocks: [
        {
          id: 'block-1',
          documentId: 'doc-1',
          kind: 'markdown' as const,
          position: 0,
          content: '내용',
          language: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway(currentDocument);
    session.hasUnsavedLocalChanges.mockReturnValue(true);
    const ui = createUiGateway();
    const backend = {
      bootstrapApp: vi.fn(),
      listDocuments: vi.fn(async () => []),
      listTrashDocuments: vi.fn(async () => []),
      getWindowControlRuntimeState: vi.fn(),
      searchDocuments: vi.fn(),
      deleteAllDocuments: vi.fn(),
      openDocument: vi.fn(),
    } as unknown as BackendPort;
    const useCases = createWorkspaceUseCases({
      backend,
      editorPersistence: { clearAll: vi.fn() } as never,
      preferences: preferences as never,
      scheduler: { setTimeout: vi.fn(), clearTimeout: vi.fn() },
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.refreshWorkspaceDocumentsAfterSync(
      createDocumentsChangedEvent({
        affectedDocumentIds: ['doc-1'],
      }),
    );

    expect(backend.openDocument).not.toHaveBeenCalled();
    expect(workspace.setSyncNotice).toHaveBeenCalledWith(
      '다른 기기 변경이 있습니다. 저장 후 다시 반영됩니다.',
    );
  });
});
