import { AlertTriangle, Check, MoonStar, MonitorCog, SunMedium, X } from 'lucide-react';
import { useState } from 'react';
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
            <span className="document-menu-option-description">
              {icloudSyncEnabled
                ? icloudSyncStatus.state === 'syncing'
                  ? '동기화 중...'
                  : icloudSyncStatus.lastSyncAt
                    ? `마지막 동기화: ${new Date(icloudSyncStatus.lastSyncAt).toLocaleString('ko-KR')}`
                    : '대기 중'
                : 'iCloud를 통해 모든 기기에서 노트를 동기화합니다.'}
            </span>
          </div>
          <div className="settings-segmented">
            <button
              className={`settings-segmented-option${!icloudSyncEnabled ? ' is-active' : ''}`}
              type="button"
              onClick={() => void setIcloudSyncEnabled(false)}
            >
              꺼짐
            </button>
            <button
              className={`settings-segmented-option${icloudSyncEnabled ? ' is-active' : ''}`}
              type="button"
              onClick={() => void setIcloudSyncEnabled(true)}
            >
              켜짐
            </button>
          </div>
          {icloudSyncStatus.state === 'error' && icloudSyncStatus.errorMessage && (
            <span className="settings-error-message">{icloudSyncStatus.errorMessage}</span>
          )}
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
