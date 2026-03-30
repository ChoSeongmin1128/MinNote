import { describe, expect, it, vi } from 'vitest';
import type { DocumentVm } from '../../models/document';
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
    bodyFontFamily: 'system-sans',
    bodyFontSizePx: 16,
    codeFontFamily: 'system-mono',
    codeFontSizePx: 14,
    menuBarIconEnabled: true,
    alwaysOnTopEnabled: false,
    windowOpacityPercent: 100,
    globalToggleShortcut: 'Option+M',
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
        getWindowControlRuntimeState: vi.fn(async () => ({
          globalShortcutError: 'runtime error',
          menuBarIconError: 'tray error',
          windowPreferenceError: 'window error',
        })),
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
});
