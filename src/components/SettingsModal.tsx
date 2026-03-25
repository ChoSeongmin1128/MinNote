import { AlertTriangle, MoonStar, MonitorCog, RefreshCw, SunMedium, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  deleteAllDocuments,
  setAlwaysOnTopEnabled,
  setDefaultBlockKind,
  setDefaultBlockTintPreset,
  setDefaultDocumentSurfaceTonePreset,
  setGlobalToggleShortcut,
  setIcloudSyncEnabled,
  setMenuBarIconEnabled,
  setThemeMode,
} from '../app/actions';
import { BlockTintPreview } from './BlockTintPreview';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import { DOCUMENT_SURFACE_TONE_PRESETS } from '../lib/documentSurfaceTone';
import { DocumentSurfacePreview } from './DocumentSurfacePreview';
import { SegmentedSelector } from './SegmentedSelector';
import type { BlockKind, ThemeMode } from '../lib/types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { checkForUpdate, type UpdateStatus } from '../lib/appUpdater';
import { ShortcutCaptureField } from './ShortcutCaptureField';
import {
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
} from '../lib/globalShortcut';
import { useWindowOpacityControl } from '../hooks/useWindowOpacityControl';

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

const ICLOUD_OPTIONS = [
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
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
  const defaultDocumentSurfaceTonePreset = useWorkspaceStore((state) => state.defaultDocumentSurfaceTonePreset);
  const defaultBlockKind = useWorkspaceStore((state) => state.defaultBlockKind);
  const icloudSyncEnabled = useWorkspaceStore((state) => state.icloudSyncEnabled);
  const icloudSyncStatus = useWorkspaceStore((state) => state.icloudSyncStatus);
  const menuBarIconEnabled = useWorkspaceStore((state) => state.menuBarIconEnabled);
  const alwaysOnTopEnabled = useWorkspaceStore((state) => state.alwaysOnTopEnabled);
  const globalToggleShortcut = useWorkspaceStore((state) => state.globalToggleShortcut);
  const globalShortcutError = useWorkspaceStore((state) => state.globalShortcutError);
  const { draftOpacity, previewOpacity, commitOpacity } = useWindowOpacityControl();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const installerRef = useRef<{ install(): Promise<void>; relaunch(): Promise<void> } | null>(null);

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

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">테마</span>
          </div>
          <SegmentedSelector
            ariaLabel="테마 선택"
            tone="settings"
            value={themeMode}
            options={THEME_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
              icon: option.icon,
            }))}
            onChange={(nextValue) => setThemeMode(nextValue)}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">기본 블록 종류</span>
          </div>
          <SegmentedSelector
            ariaLabel="기본 블록 종류 선택"
            tone="settings"
            value={defaultBlockKind}
            options={BLOCK_KIND_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            onChange={(nextValue) => setDefaultBlockKind(nextValue)}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">기본 블록 색상쌍</span>
          </div>
          <SegmentedSelector
            ariaLabel="기본 블록 색상쌍 선택"
            tone="settings"
            value={defaultBlockTintPreset}
            layout="palette"
            columns={3}
            options={BLOCK_TINT_OPTIONS}
            onChange={(nextValue) => setDefaultBlockTintPreset(nextValue)}
            renderOption={(option) => (
              <span className="tint-selector-card">
                <BlockTintPreview className="tint-selector-preview" preset={option.value} />
                <span className="tint-selector-label">{option.label}</span>
              </span>
            )}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">기본 문서 배경 톤</span>
          </div>
          <SegmentedSelector
            ariaLabel="기본 문서 배경 톤 선택"
            tone="settings"
            value={defaultDocumentSurfaceTonePreset}
            layout="palette"
            columns={3}
            options={DOCUMENT_SURFACE_TONE_OPTIONS}
            onChange={(nextValue) => setDefaultDocumentSurfaceTonePreset(nextValue)}
            renderOption={(option) => (
              <span className="tint-selector-card">
                <DocumentSurfacePreview className="surface-selector-preview" preset={option.value} />
                <span className="tint-selector-label">{option.label}</span>
              </span>
            )}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">메뉴바 아이콘</span>
          </div>
          <SegmentedSelector
            ariaLabel="메뉴바 아이콘 선택"
            tone="settings"
            value={menuBarIconEnabled ? 'on' : 'off'}
            options={MENU_BAR_OPTIONS}
            onChange={(nextValue) => setMenuBarIconEnabled(nextValue === 'on')}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">창 제어</span>
          </div>

          <label className="settings-toggle-row" htmlFor="settings-always-on-top">
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">항상 위에 고정</span>
              <span className="document-menu-option-description">
                다른 앱으로 전환해도 MinNote 창을 위에 유지합니다.
              </span>
            </span>
            <input
              id="settings-always-on-top"
              type="checkbox"
              checked={alwaysOnTopEnabled}
              onChange={(event) => {
                void setAlwaysOnTopEnabled(event.target.checked);
              }}
            />
          </label>

          <div className="settings-range-group">
            <div className="settings-range-header">
              <div className="settings-range-title-group">
                <span className="settings-section-title">투명도</span>
                <span className="settings-inline-stat">{draftOpacity}%</span>
              </div>
              <button
                className="ghost-button settings-inline-action"
                type="button"
                disabled={draftOpacity === MAX_WINDOW_OPACITY_PERCENT}
                onClick={() => {
                  void commitOpacity(MAX_WINDOW_OPACITY_PERCENT);
                }}
              >
                100%로 복원
              </button>
            </div>
            <input
              className="opacity-slider"
              type="range"
              min={MIN_WINDOW_OPACITY_PERCENT}
              max={MAX_WINDOW_OPACITY_PERCENT}
              step={1}
              value={draftOpacity}
              onInput={(event) => {
                void previewOpacity(Number(event.currentTarget.value));
              }}
              onPointerUp={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
              onKeyUp={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
              onBlur={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
            />
          </div>

          <div className="settings-shortcut-group">
            <div className="settings-section-header">
              <span className="settings-section-title">전역 단축키</span>
            </div>
            <ShortcutCaptureField
              value={globalToggleShortcut}
              error={globalShortcutError}
              onCommit={(shortcut) => setGlobalToggleShortcut(shortcut)}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">iCloud 동기화</span>
            <span className="document-menu-option-description">
              {icloudSyncStatus.state === 'error'
                ? icloudSyncStatus.errorMessage ?? '동기화 중 오류가 발생했습니다.'
                : '같은 Apple ID로 로그인된 Mac 사이에서 문서를 동기화합니다.'}
            </span>
          </div>
          <SegmentedSelector
            ariaLabel="iCloud 동기화 선택"
            tone="settings"
            value={icloudSyncEnabled ? 'on' : 'off'}
            options={ICLOUD_OPTIONS}
            onChange={(nextValue) => setIcloudSyncEnabled(nextValue === 'on')}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">업데이트</span>
            {updateStatus.state !== 'idle' && (
              <span className="document-menu-option-description">
                {updateStatus.state === 'checking' && '확인 중...'}
                {updateStatus.state === 'up-to-date' && '최신 버전입니다.'}
                {updateStatus.state === 'available' && `새 버전 ${updateStatus.version}이 있습니다.`}
                {updateStatus.state === 'downloading' && `다운로드 중... ${updateStatus.percent}%`}
                {updateStatus.state === 'ready' && '설치 완료. 재시작하면 적용됩니다.'}
                {updateStatus.state === 'error' && updateStatus.message}
              </span>
            )}
          </div>
          <div className="settings-update-actions">
            {updateStatus.state !== 'ready' && (
              <button
                className="ghost-button"
                type="button"
                disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                onClick={() => {
                  void checkForUpdate(setUpdateStatus).then((installer) => {
                    if (installer) installerRef.current = installer;
                  });
                }}
              >
                <RefreshCw size={14} />
                업데이트 확인
              </button>
            )}
            {updateStatus.state === 'available' && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => void installerRef.current?.install()}
              >
                지금 설치
              </button>
            )}
            {updateStatus.state === 'ready' && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => void installerRef.current?.relaunch()}
              >
                재시작
              </button>
            )}
          </div>
        </div>

        <div className="settings-section danger-zone">
          <div className="settings-section-header">
            <span className="settings-section-title">Danger Zone</span>
          </div>
          {!isConfirmOpen ? (
            <button className="document-menu-danger" type="button" onClick={() => setConfirmOpen(true)}>
              <AlertTriangle size={14} />
              전체 문서 삭제
            </button>
          ) : (
            <div className="danger-confirm-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setConfirmOpen(false)}
              >
                취소
              </button>
              <button
                className="document-menu-danger"
                type="button"
                onClick={() => {
                  void deleteAllDocuments();
                  setConfirmOpen(false);
                }}
              >
                전체 문서 삭제 실행
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
