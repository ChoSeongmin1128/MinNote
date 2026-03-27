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
    setMenuBarIconEnabled: vi.fn(),
    getMenuBarIconError: vi.fn(() => null),
    setMenuBarIconError: vi.fn(),
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

  it('surfaces menu bar icon runtime error without committing failed state', async () => {
    const workspace = createWorkspaceGateway();
    const preferences = createPreferencesGateway();
    const backend = {
      setMenuBarIconEnabled: vi.fn(async () => {
        throw new Error('메뉴바 아이콘을 초기화하지 못했습니다.');
      }),
    };

    const useCases = createPreferencesUseCases({
      backend: backend as never,
      preferences: preferences as never,
      workspace: workspace as never,
    });

    await useCases.setMenuBarIconEnabled(true);

    expect(preferences.setMenuBarIconEnabled).not.toHaveBeenCalledWith(true);
    expect(preferences.setMenuBarIconError).toHaveBeenCalledWith('메뉴바 아이콘을 초기화하지 못했습니다.');
    expect(workspace.setError).toHaveBeenCalledWith('메뉴바 아이콘을 초기화하지 못했습니다.');
  });

});
