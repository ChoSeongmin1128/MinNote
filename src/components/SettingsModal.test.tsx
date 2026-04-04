import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { useUpdaterStore } from '../stores/updaterStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const controllerMocks = vi.hoisted(() => ({
  deleteAllDocuments: vi.fn(),
  runICloudSync: vi.fn(),
  setAlwaysOnTopEnabled: vi.fn(),
  setBodyFontFamily: vi.fn(),
  setCodeFontFamily: vi.fn(),
  setDefaultBlockKind: vi.fn(),
  setDefaultBlockTintPreset: vi.fn(),
  setDefaultDocumentSurfaceTonePreset: vi.fn(),
  setGlobalToggleShortcut: vi.fn(),
  setICloudSyncEnabled: vi.fn(),
  setMenuBarIconEnabled: vi.fn(),
  setThemeMode: vi.fn(),
}));

vi.mock('../app/controllers', () => ({
  usePreferencesController: () => ({
    runICloudSync: controllerMocks.runICloudSync,
    setAlwaysOnTopEnabled: controllerMocks.setAlwaysOnTopEnabled,
    setBodyFontFamily: controllerMocks.setBodyFontFamily,
    setCodeFontFamily: controllerMocks.setCodeFontFamily,
    setDefaultBlockKind: controllerMocks.setDefaultBlockKind,
    setDefaultBlockTintPreset: controllerMocks.setDefaultBlockTintPreset,
    setDefaultDocumentSurfaceTonePreset: controllerMocks.setDefaultDocumentSurfaceTonePreset,
    setGlobalToggleShortcut: controllerMocks.setGlobalToggleShortcut,
    setICloudSyncEnabled: controllerMocks.setICloudSyncEnabled,
    setMenuBarIconEnabled: controllerMocks.setMenuBarIconEnabled,
    setThemeMode: controllerMocks.setThemeMode,
  }),
  useWorkspaceController: () => ({
    deleteAllDocuments: controllerMocks.deleteAllDocuments,
  }),
}));

vi.mock('../hooks/useEditorTypographyControl', () => ({
  useEditorTypographyControl: () => ({
    draftBodyFontSizePx: 16,
    draftCodeFontSizePx: 14,
    previewBodyFontSizePx: vi.fn(),
    commitBodyFontSizePx: vi.fn(),
    previewCodeFontSizePx: vi.fn(),
    commitCodeFontSizePx: vi.fn(),
  }),
}));

vi.mock('../hooks/useWindowOpacityControl', () => ({
  useWindowOpacityControl: () => ({
    draftOpacity: 100,
    previewOpacity: vi.fn(),
    commitOpacity: vi.fn(),
  }),
}));

vi.mock('../hooks/useICloudSyncDebugInfo', () => ({
  useICloudSyncDebugInfo: () => ({
    debugInfo: null,
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('./settings/SettingsThemeDefaultsSection', () => ({
  SettingsThemeDefaultsSection: () => <div>theme section</div>,
}));

vi.mock('./settings/SettingsFontSection', () => ({
  SettingsFontSection: () => <div>font section</div>,
}));

vi.mock('./settings/SettingsWindowSection', () => ({
  SettingsWindowSection: () => <div>window section</div>,
}));

vi.mock('./settings/SettingsICloudSection', () => ({
  SettingsICloudSection: () => <div>icloud section</div>,
}));

vi.mock('./settings/SettingsUpdateSection', () => ({
  SettingsUpdateSection: () => <div>update section</div>,
}));

vi.mock('./settings/SettingsDangerZoneSection', () => ({
  SettingsDangerZoneSection: () => <div>danger section</div>,
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      themeMode: 'system',
      defaultBlockTintPreset: 'mist',
      defaultDocumentSurfaceTonePreset: 'default',
      defaultBlockKind: 'markdown',
      bodyFontFamily: 'system-sans',
      codeFontFamily: 'system-mono',
      menuBarIconEnabled: false,
      alwaysOnTopEnabled: false,
      globalToggleShortcut: 'Option+M',
      globalShortcutError: null,
      menuBarIconError: null,
      windowPreferenceError: null,
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
    });
    useUpdaterStore.setState({
      appUpdateStatus: {
        state: 'idle',
        version: null,
        percent: null,
        message: null,
        lastCheckedAt: null,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('closes when escape is pressed', async () => {
    const onClose = vi.fn();

    render(<SettingsModal isOpen onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a close button inside the sticky header', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    const header = screen.getByText('전체 설정').closest('.settings-modal-header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole('button', { name: '설정 닫기' })).toBeInTheDocument();
  });
});
