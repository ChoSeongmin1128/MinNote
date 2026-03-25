import { describe, expect, it, vi } from 'vitest';
import { createPreferencesUseCases } from './preferencesUseCases';

function createWorkspaceGateway() {
  return {
    clearError: vi.fn(),
    setError: vi.fn(),
  };
}

function createPreferencesGateway() {
  let opacity = 100;
  let shortcut: string | null = 'Option+M';

  return {
    setThemeMode: vi.fn(),
    setDefaultBlockTintPreset: vi.fn(),
    setDefaultDocumentSurfaceTonePreset: vi.fn(),
    setDefaultBlockKind: vi.fn(),
    setIcloudSyncEnabled: vi.fn(),
    getIcloudSyncStatus: vi.fn(() => ({
      state: 'idle' as const,
      lastSyncAt: null,
      lastStatusAt: null,
      lastFetchAt: null,
      lastSendAt: null,
      initialFetchCompleted: false,
      errorMessage: null,
    })),
    setIcloudSyncStatus: vi.fn(),
    setMenuBarIconEnabled: vi.fn(),
    getAlwaysOnTopEnabled: vi.fn(() => false),
    setAlwaysOnTopEnabled: vi.fn(),
    getWindowOpacityPercent: vi.fn(() => opacity),
    setWindowOpacityPercent: vi.fn((value: number) => {
      opacity = value;
    }),
    getGlobalToggleShortcut: vi.fn(() => shortcut),
    setGlobalToggleShortcut: vi.fn((value: string | null) => {
      shortcut = value;
    }),
    getGlobalShortcutError: vi.fn(() => null),
    setGlobalShortcutError: vi.fn(),
  };
}

describe('preferences usecases', () => {
  it('keeps only committed opacity in preferences state', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    let resolveSlow!: (value: number) => void;
    let resolveFast!: (value: number) => void;

    const backend = {
      previewWindowOpacityPercent: vi.fn(async (value: number) => value),
      setWindowOpacityPercent: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<number>((resolve) => {
              resolveSlow = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<number>((resolve) => {
              resolveFast = resolve;
            }),
        ),
    };

    const useCases = createPreferencesUseCases({
      backend: backend as never,
      preferences: preferences as never,
      workspace: workspace as never,
    });

    const slowCommit = useCases.setWindowOpacityPercent(80);
    const fastCommit = useCases.setWindowOpacityPercent(92);

    resolveFast(92);
    await fastCommit;
    resolveSlow(80);
    await slowCommit;

    expect(preferences.setWindowOpacityPercent).toHaveBeenLastCalledWith(92);
  });

  it('restores previous shortcut value and exposes runtime error on failure', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const backend = {
      setGlobalToggleShortcut: vi.fn(async () => {
        throw new Error('이미 다른 앱에서 사용 중입니다.');
      }),
    };

    const useCases = createPreferencesUseCases({
      backend: backend as never,
      preferences: preferences as never,
      workspace: workspace as never,
    });

    await expect(useCases.setGlobalToggleShortcut('Cmd+Shift+K')).rejects.toThrow(
      '이미 다른 앱에서 사용 중입니다.',
    );

    expect(preferences.setGlobalShortcutError).toHaveBeenCalledWith('이미 다른 앱에서 사용 중입니다.');
    expect(preferences.setGlobalToggleShortcut).not.toHaveBeenCalledWith('Cmd+Shift+K');
  });

  it('refreshes icloud sync immediately after enabling it', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const backend = {
      setIcloudSyncEnabled: vi.fn(async () => true),
      refreshIcloudSync: vi.fn(async () => true),
    };

    const useCases = createPreferencesUseCases({
      backend: backend as never,
      preferences: preferences as never,
      workspace: workspace as never,
    });

    await useCases.setIcloudSyncEnabled(true);

    expect(backend.refreshIcloudSync).toHaveBeenCalledTimes(1);
  });

  it('keeps icloud enabled in preferences when refresh fails after enabling', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const backend = {
      setIcloudSyncEnabled: vi.fn(async () => true),
      refreshIcloudSync: vi.fn(async () => {
        throw new Error('refresh failed');
      }),
    };

    const useCases = createPreferencesUseCases({
      backend: backend as never,
      preferences: preferences as never,
      workspace: workspace as never,
    });

    await useCases.setIcloudSyncEnabled(true);

    expect(preferences.setIcloudSyncEnabled).toHaveBeenCalledWith(true);
    expect(preferences.setIcloudSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: 'error',
        errorMessage: 'refresh failed',
      }),
    );
  });
});
