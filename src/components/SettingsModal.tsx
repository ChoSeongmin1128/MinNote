import { AlertTriangle, Check, MoonStar, MonitorCog, RefreshCw, SunMedium, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { BlockTintPreview } from './BlockTintPreview';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import {
  deleteAllDocuments,
  setDefaultBlockTintPreset,
  setIcloudSyncEnabled,
  setThemeMode,
} from '../controllers/appController';
import type { ThemeMode } from '../lib/types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { checkForUpdate, type UpdateStatus } from '../lib/appUpdater';

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; icon: typeof MonitorCog }> = [
  { id: 'system', label: '자동', icon: MonitorCog },
  { id: 'light', label: '라이트', icon: SunMedium },
  { id: 'dark', label: '다크', icon: MoonStar },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
  const icloudSyncEnabled = useWorkspaceStore((state) => state.icloudSyncEnabled);
  const icloudSyncStatus = useWorkspaceStore((state) => state.icloudSyncStatus);
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
          <div>
            <h2 className="settings-title">전체 설정</h2>
            <p className="settings-description">앱 전체 기본값과 위험 작업을 관리합니다.</p>
          </div>
          <button className="icon-button" type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">테마</span>
            <span className="document-menu-option-description">앱 전체 색상 모드를 제어합니다.</span>
          </div>
          <div className="settings-segmented">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  className={`settings-segmented-option${themeMode === option.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => void setThemeMode(option.id)}
                >
                  <Icon size={14} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">기본 블록 색상쌍</span>
            <span className="document-menu-option-description">override가 없는 문서에 적용됩니다.</span>
          </div>
          <div className="document-menu-options">
            {BLOCK_TINT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`document-menu-option${defaultBlockTintPreset === preset.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => void setDefaultBlockTintPreset(preset.id)}
              >
                <BlockTintPreview preset={preset.id} />
                <span className="document-menu-option-title">{preset.label}</span>
                {defaultBlockTintPreset === preset.id ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">iCloud 동기화</span>
            <span className="document-menu-option-description">추후 지원 예정</span>
          </div>
          <div className="settings-segmented" style={{ opacity: 0.4, pointerEvents: 'none' }}>
            <button className="settings-segmented-option is-active" type="button" disabled>
              꺼짐
            </button>
            <button className="settings-segmented-option" type="button" disabled>
              켜짐
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-title">업데이트</span>
            <span className="document-menu-option-description">
              {updateStatus.state === 'idle' && '최신 버전을 확인합니다.'}
              {updateStatus.state === 'checking' && '확인 중...'}
              {updateStatus.state === 'up-to-date' && '최신 버전입니다.'}
              {updateStatus.state === 'available' && `새 버전 ${updateStatus.version} 이 있습니다.`}
              {updateStatus.state === 'downloading' && `다운로드 중... ${updateStatus.percent}%`}
              {updateStatus.state === 'ready' && '설치 완료. 재시작하면 적용됩니다.'}
              {updateStatus.state === 'error' && updateStatus.message}
            </span>
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
            <span className="document-menu-option-description">모든 문서를 즉시 삭제합니다.</span>
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
