import { AlertTriangle, MoonStar, MonitorCog, RefreshCw, SunMedium, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  deleteAllDocuments,
  setDefaultBlockKind,
  setDefaultBlockTintPreset,
  setDefaultDocumentSurfaceTonePreset,
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
  const menuBarIconEnabled = useWorkspaceStore((state) => state.menuBarIconEnabled);
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
            value={menuBarIconEnabled ? 'on' : 'off'}
            options={MENU_BAR_OPTIONS}
            onChange={(nextValue) => setMenuBarIconEnabled(nextValue === 'on')}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">iCloud 동기화</span>
            <span className="document-menu-option-description">추후 지원 예정</span>
          </div>
          <SegmentedSelector
            ariaLabel="iCloud 동기화 선택"
            value="off"
            options={ICLOUD_OPTIONS}
            disabled
            onChange={() => {}}
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
