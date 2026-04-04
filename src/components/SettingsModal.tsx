import { MoonStar, MonitorCog, SunMedium, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferencesController, useWorkspaceController } from '../app/controllers';
import { useEditorTypographyControl } from '../hooks/useEditorTypographyControl';
import { useICloudSyncDebugInfo } from '../hooks/useICloudSyncDebugInfo';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import { DOCUMENT_SURFACE_TONE_PRESETS } from '../lib/documentSurfaceTone';
import {
  BODY_FONT_OPTIONS,
  CODE_FONT_OPTIONS,
  MAX_BODY_FONT_SIZE_PX,
  MAX_CODE_FONT_SIZE_PX,
  MIN_BODY_FONT_SIZE_PX,
  MIN_CODE_FONT_SIZE_PX,
} from '../lib/editorTypography';
import type { BlockKind, ThemeMode } from '../lib/types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
} from '../lib/globalShortcut';
import { useWindowOpacityControl } from '../hooks/useWindowOpacityControl';
import { useUpdaterStore } from '../stores/updaterStore';
import { SettingsDangerZoneSection } from './settings/SettingsDangerZoneSection';
import { SettingsFontSection } from './settings/SettingsFontSection';
import { SettingsICloudSection } from './settings/SettingsICloudSection';
import { SettingsThemeDefaultsSection } from './settings/SettingsThemeDefaultsSection';
import { SettingsUpdateSection } from './settings/SettingsUpdateSection';
import { SettingsWindowSection } from './settings/SettingsWindowSection';

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; icon: typeof MonitorCog }> = [
  { id: 'system', label: '자동', icon: MonitorCog },
  { id: 'light', label: '라이트', icon: SunMedium },
  { id: 'dark', label: '다크', icon: MoonStar },
];

const BLOCK_KIND_OPTIONS: Array<{ id: BlockKind; label: string }> = [
  { id: 'markdown', label: '마크다운' },
  { id: 'text', label: '텍스트' },
  { id: 'code', label: '코드' },
];

const MENU_BAR_OPTIONS = [
  { value: 'off', label: '꺼짐' },
  { value: 'on', label: '켜짐' },
] as const;

const BLOCK_TINT_OPTIONS = BLOCK_TINT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

const DOCUMENT_SURFACE_TONE_OPTIONS = DOCUMENT_SURFACE_TONE_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    setAlwaysOnTopEnabled,
    setDefaultBlockKind,
    setDefaultBlockTintPreset,
    setDefaultDocumentSurfaceTonePreset,
    setGlobalToggleShortcut,
    setBodyFontFamily,
    setCodeFontFamily,
    setICloudSyncEnabled,
    setMenuBarIconEnabled,
    resetICloudSyncCheckpoint,
    runICloudSync,
    forceUploadAllDocuments,
    forceRedownloadFromCloud,
    setThemeMode,
  } = usePreferencesController();
  const { deleteAllDocuments } = useWorkspaceController();
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
  const defaultDocumentSurfaceTonePreset = useWorkspaceStore((state) => state.defaultDocumentSurfaceTonePreset);
  const defaultBlockKind = useWorkspaceStore((state) => state.defaultBlockKind);
  const bodyFontFamily = useWorkspaceStore((state) => state.bodyFontFamily);
  const codeFontFamily = useWorkspaceStore((state) => state.codeFontFamily);
  const menuBarIconEnabled = useWorkspaceStore((state) => state.menuBarIconEnabled);
  const alwaysOnTopEnabled = useWorkspaceStore((state) => state.alwaysOnTopEnabled);
  const globalToggleShortcut = useWorkspaceStore((state) => state.globalToggleShortcut);
  const globalShortcutError = useWorkspaceStore((state) => state.globalShortcutError);
  const menuBarIconError = useWorkspaceStore((state) => state.menuBarIconError);
  const windowPreferenceError = useWorkspaceStore((state) => state.windowPreferenceError);
  const icloudSyncStatus = useWorkspaceStore((state) => state.icloudSyncStatus);
  const appUpdateStatus = useUpdaterStore((state) => state.appUpdateStatus);
  const { draftOpacity, previewOpacity, commitOpacity } = useWindowOpacityControl();
  const {
    draftBodyFontSizePx,
    draftCodeFontSizePx,
    previewBodyFontSizePx,
    commitBodyFontSizePx,
    previewCodeFontSizePx,
    commitCodeFontSizePx,
  } = useEditorTypographyControl();
  const {
    debugInfo: icloudDebugInfo,
    error: icloudDebugError,
    isLoading: isIcloudDebugLoading,
    refresh: refreshIcloudDebugInfo,
  } = useICloudSyncDebugInfo(isOpen);
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button className="modal-backdrop" type="button" aria-label="설정 닫기" onClick={onClose} />
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="전체 설정">
        <div className="settings-modal-header">
          <h2 className="settings-title">전체 설정</h2>
          <button className="icon-button" type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <SettingsThemeDefaultsSection
          themeMode={themeMode}
          themeOptions={THEME_OPTIONS}
          defaultBlockKind={defaultBlockKind}
          blockKindOptions={BLOCK_KIND_OPTIONS}
          defaultBlockTintPreset={defaultBlockTintPreset}
          blockTintOptions={BLOCK_TINT_OPTIONS}
          defaultDocumentSurfaceTonePreset={defaultDocumentSurfaceTonePreset}
          documentSurfaceToneOptions={DOCUMENT_SURFACE_TONE_OPTIONS}
          onThemeModeChange={setThemeMode}
          onDefaultBlockKindChange={setDefaultBlockKind}
          onDefaultBlockTintPresetChange={setDefaultBlockTintPreset}
          onDefaultDocumentSurfaceTonePresetChange={setDefaultDocumentSurfaceTonePreset}
        />

        <SettingsFontSection
          bodyFontFamily={bodyFontFamily}
          bodyFontSizePx={draftBodyFontSizePx}
          codeFontFamily={codeFontFamily}
          codeFontSizePx={draftCodeFontSizePx}
          bodyFontOptions={BODY_FONT_OPTIONS}
          codeFontOptions={CODE_FONT_OPTIONS}
          minBodyFontSizePx={MIN_BODY_FONT_SIZE_PX}
          maxBodyFontSizePx={MAX_BODY_FONT_SIZE_PX}
          minCodeFontSizePx={MIN_CODE_FONT_SIZE_PX}
          maxCodeFontSizePx={MAX_CODE_FONT_SIZE_PX}
          onBodyFontFamilyChange={setBodyFontFamily}
          onPreviewBodyFontSizePx={previewBodyFontSizePx}
          onCommitBodyFontSizePx={commitBodyFontSizePx}
          onCodeFontFamilyChange={setCodeFontFamily}
          onPreviewCodeFontSizePx={previewCodeFontSizePx}
          onCommitCodeFontSizePx={commitCodeFontSizePx}
        />

        <SettingsWindowSection
          menuBarIconEnabled={menuBarIconEnabled}
          alwaysOnTopEnabled={alwaysOnTopEnabled}
          draftOpacity={draftOpacity}
          globalToggleShortcut={globalToggleShortcut}
          globalShortcutError={globalShortcutError}
          menuBarIconError={menuBarIconError}
          windowPreferenceError={windowPreferenceError}
          menuBarOptions={MENU_BAR_OPTIONS}
          minOpacityPercent={MIN_WINDOW_OPACITY_PERCENT}
          maxOpacityPercent={MAX_WINDOW_OPACITY_PERCENT}
          onMenuBarIconEnabledChange={setMenuBarIconEnabled}
          onAlwaysOnTopEnabledChange={setAlwaysOnTopEnabled}
          onPreviewOpacity={previewOpacity}
          onCommitOpacity={commitOpacity}
          onGlobalToggleShortcutCommit={setGlobalToggleShortcut}
        />

        <SettingsICloudSection
          status={icloudSyncStatus}
          debugInfo={icloudDebugInfo}
          debugError={icloudDebugError}
          debugLoading={isIcloudDebugLoading}
          onEnabledChange={(enabled) => {
            void setICloudSyncEnabled(enabled);
          }}
          onRunSync={() => {
            void runICloudSync();
          }}
          onRefreshDebug={() => {
            void refreshIcloudDebugInfo();
          }}
          onResetCheckpoint={() => {
            void resetICloudSyncCheckpoint();
          }}
          onForceUpload={() => {
            void forceUploadAllDocuments();
          }}
          onForceRedownload={() => {
            if (!window.confirm('로컬 문서를 비우고 Cloud 기준으로 다시 받습니다. 계속하시겠습니까?')) {
              return;
            }
            void forceRedownloadFromCloud();
          }}
        />

        <SettingsUpdateSection appUpdateStatus={appUpdateStatus} />

        <SettingsDangerZoneSection
          isConfirmOpen={isConfirmOpen}
          onOpenConfirm={() => setConfirmOpen(true)}
          onCloseConfirm={() => setConfirmOpen(false)}
          onDeleteAllDocuments={async () => {
            await deleteAllDocuments();
            setConfirmOpen(false);
          }}
        />
      </section>
    </>
  );
}
