import type { ICloudSyncStatus } from '../../lib/types';

export type EditorSaveStatus = 'saved' | 'pending' | 'saving' | 'error';
export type CloudSyncIndicatorStatus = 'synced' | 'pending' | 'syncing' | 'warning' | 'off';

export interface EditorSaveStatusInput {
  isFlushing: boolean;
  lastSavedAt: number | null;
  lastLocalMutationAt: number | null;
  saveError: string | null;
}

export interface EditorStatusPresentation {
  saveLabel: string;
  saveStatus: EditorSaveStatus;
  cloudStatus: CloudSyncIndicatorStatus;
  cloudTooltip: string;
}

export function deriveEditorSaveStatus({
  isFlushing,
  lastSavedAt,
  lastLocalMutationAt,
  saveError,
}: EditorSaveStatusInput): EditorSaveStatus {
  if (saveError) {
    return 'error';
  }

  if (isFlushing) {
    return 'saving';
  }

  if (lastLocalMutationAt != null && (lastSavedAt ?? 0) < lastLocalMutationAt) {
    return 'pending';
  }

  return 'saved';
}

export function deriveCloudSyncIndicatorStatus(
  status: ICloudSyncStatus,
): CloudSyncIndicatorStatus {
  if (!status.enabled) {
    return 'off';
  }

  if (status.state === 'offline' || status.state === 'error' || status.lastErrorCode) {
    return 'warning';
  }

  if (status.state === 'checking' || status.state === 'syncing') {
    return 'syncing';
  }

  if (status.state === 'pending' || status.pendingOperationCount > 0) {
    return 'pending';
  }

  return 'synced';
}

function getSaveLabel(saveStatus: EditorSaveStatus) {
  switch (saveStatus) {
    case 'error':
      return '저장 실패';
    case 'saving':
      return '저장 중';
    case 'pending':
      return '저장 대기';
    case 'saved':
    default:
      return '저장됨';
  }
}

function getCloudTooltip(
  cloudStatus: CloudSyncIndicatorStatus,
  syncStatus: ICloudSyncStatus,
) {
  switch (cloudStatus) {
    case 'off':
      return 'iCloud 동기화가 꺼져 있습니다.';
    case 'warning':
      if (syncStatus.state === 'offline') {
        return '오프라인 상태라 iCloud에 반영하지 못했습니다.';
      }
      return syncStatus.lastErrorMessage ?? 'iCloud 동기화에 문제가 있습니다.';
    case 'syncing':
      return syncStatus.state === 'checking'
        ? 'iCloud 연결 상태를 확인하고 있습니다.'
        : 'iCloud와 동기화 중입니다.';
    case 'pending':
      return syncStatus.pendingOperationCount > 0
        ? `다른 기기와 동기화할 변경 ${syncStatus.pendingOperationCount}건이 있습니다.`
        : '다른 기기와 동기화할 변경이 있습니다.';
    case 'synced':
    default:
      return 'iCloud와 동기화되었습니다.';
  }
}

export function deriveEditorStatusPresentation(
  saveInput: EditorSaveStatusInput,
  syncStatus: ICloudSyncStatus,
): EditorStatusPresentation {
  const saveStatus = deriveEditorSaveStatus(saveInput);
  const cloudStatus = deriveCloudSyncIndicatorStatus(syncStatus);

  return {
    saveLabel: getSaveLabel(saveStatus),
    saveStatus,
    cloudStatus,
    cloudTooltip: getCloudTooltip(cloudStatus, syncStatus),
  };
}
