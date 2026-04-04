import { describe, expect, it, vi } from 'vitest';
import type { DocumentVm } from '../../models/document';
import type { WorkspaceBootstrapState } from '../../models/workspace';
import { createDocumentUseCases } from './documentUseCases';

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
    themeMode: 'light',
    defaultBlockTintPreset: 'mist',
    defaultDocumentSurfaceTonePreset: 'default',
    defaultBlockKind,
    bodyFontFamily: 'system-sans',
    bodyFontSizePx: 16,
    codeFontFamily: 'system-mono',
    codeFontSizePx: 14,
    menuBarIconEnabled: false,
    alwaysOnTopEnabled: false,
    windowOpacityPercent: 100,
    globalToggleShortcut: 'Option+M',
    globalShortcutError: null,
    menuBarIconError: null,
    windowPreferenceError: null,
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

describe('document usecases', () => {
  it('syncs default block kind when deleting a document', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const session = createSessionGateway();
    const editorPersistence = { clearDocument: vi.fn(), flushDocument: vi.fn(), clearAll: vi.fn() };
    const ui = createUiGateway();
    const useCases = createDocumentUseCases({
      backend: {
        deleteDocument: vi.fn(async () => createPayload('code')),
      } as never,
      editorPersistence: editorPersistence as never,
      history: { clear: vi.fn() } as never,
      preferences: preferences as never,
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.deleteDocument('doc-1');

    expect(editorPersistence.clearDocument).toHaveBeenCalledWith('doc-1');
    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('code');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(ui.setSettingsOpen).toHaveBeenCalledWith(false);
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
    const ui = createUiGateway();
    const useCases = createDocumentUseCases({
      backend: {
        restoreDocumentFromTrash: vi.fn(async () => createPayload('text')),
      } as never,
      editorPersistence: { clearDocument: vi.fn(), flushDocument: vi.fn(), clearAll: vi.fn() } as never,
      history: { clear: vi.fn() } as never,
      preferences: preferences as never,
      session,
      ui: ui as never,
      workspace,
    });

    await useCases.restoreDocumentFromTrash('trash-doc');

    expect(preferences.setDefaultBlockKind).toHaveBeenCalledWith('text');
    expect(preferences.setDefaultDocumentSurfaceTonePreset).toHaveBeenCalledWith('default');
    expect(session.setCurrentDocument).not.toHaveBeenCalled();
  });
});
