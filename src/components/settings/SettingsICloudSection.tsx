import { AlertTriangle, CheckCircle2, Cloud, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ICloudSyncDebugInfoDto, ICloudSyncStatus } from '../../lib/types';

interface ICloudPresentation {
  label: string;
  tone: 'progress' | 'ready' | 'error';
  icon: LucideIcon;
  spin: boolean;
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return '동기화 기록 없음';
  }

  return `최근 동기화 ${new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))}`;
}

function getPresentation(status: ICloudSyncStatus): ICloudPresentation {
  if (!status.enabled) {
    return {
      label: '꺼짐',
      tone: 'ready',
      icon: CloudOff,
      spin: false,
    };
  }

  if (status.state === 'checking') {
    return { label: '확인 중', tone: 'progress', icon: RefreshCw, spin: true };
  }

  if (status.state === 'syncing') {
    return { label: '동기화 중', tone: 'progress', icon: RefreshCw, spin: true };
  }

  if (status.state === 'error') {
    return {
      label: status.lastErrorMessage ? '오류' : '동기화 오류',
      tone: 'error',
      icon: AlertTriangle,
      spin: false,
    };
  }

  if (status.lastSyncSucceededAtMs) {
    return {
      label: formatTimestamp(status.lastSyncSucceededAtMs),
      tone: 'ready',
      icon: CheckCircle2,
      spin: false,
    };
  }

  return {
    label: '동기화 기록 없음',
    tone: 'ready',
    icon: Cloud,
    spin: false,
  };
}

interface SettingsICloudSectionProps {
  status: ICloudSyncStatus;
  debugInfo: ICloudSyncDebugInfoDto | null;
  debugError: string | null;
  debugLoading: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRunSync: () => void;
  onRefreshDebug: () => void;
}

export function SettingsICloudSection({
  status,
  debugInfo,
  debugError,
  debugLoading,
  onEnabledChange,
  onRunSync,
  onRefreshDebug,
}: SettingsICloudSectionProps) {
  const presentation = getPresentation(status);
  const Icon = presentation.icon;
  const isBusy = status.state === 'checking' || status.state === 'syncing';

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div className="settings-title-stack">
          <span className="settings-section-title">iCloud 동기화</span>
          <span className="settings-experimental-badge">Experimental</span>
        </div>
        <span className={`settings-status-chip is-${presentation.tone}`}>
          <Icon className={presentation.spin ? 'spin' : undefined} size={14} />
          <span>{presentation.label}</span>
        </span>
      </div>
      <p className="settings-description">
        아직 배포 전 검증 단계입니다. 기본값은 꺼짐이며, 로컬 우선 저장을 유지합니다.
      </p>
      <div className="settings-update-actions">
        <button
          className="ghost-button"
          type="button"
          disabled={isBusy}
          onClick={() => {
            onEnabledChange(!status.enabled);
          }}
        >
          {status.enabled ? '동기화 끄기' : '동기화 켜기'}
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!status.enabled || isBusy}
          onClick={onRunSync}
        >
          <RefreshCw size={14} />
          지금 동기화
        </button>
      </div>
      <div className="settings-icloud-debug">
        <div className="settings-section-header">
          <span className="settings-section-title">디버그 정보</span>
          <button
            className="ghost-button settings-inline-action"
            type="button"
            disabled={debugLoading}
            onClick={onRefreshDebug}
          >
            <RefreshCw className={debugLoading ? 'spin' : undefined} size={14} />
            새로고침
          </button>
        </div>
        {debugInfo ? (
          <div className="settings-debug-grid">
            <span>Bridge</span>
            <span>{debugInfo.bridgeAvailable ? '사용 가능' : '없음'}</span>
            <span>Zone</span>
            <span>{debugInfo.zoneName}</span>
            <span>Token</span>
            <span>{debugInfo.serverChangeTokenPresent ? '있음' : '없음'}</span>
            <span>Outbox</span>
            <span>{debugInfo.outboxCount}</span>
            <span>Tombstones</span>
            <span>{debugInfo.tombstoneCount}</span>
            <span>Device</span>
            <span>{debugInfo.deviceIdSuffix}</span>
          </div>
        ) : null}
        {debugInfo?.bridgeError ? <p className="settings-field-hint">{debugInfo.bridgeError}</p> : null}
        {debugError ? <p className="settings-field-hint">{debugError}</p> : null}
      </div>
      {status.lastErrorMessage && (
        <p className="settings-field-hint">{status.lastErrorMessage}</p>
      )}
    </div>
  );
}
