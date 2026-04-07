import type { AppUpdateStatus } from '../types';
import { updaterGateway } from '../../adapters/updaterGateway';

export function buildStatus(next: Partial<AppUpdateStatus> & Pick<AppUpdateStatus, 'state'>): AppUpdateStatus {
  const current = updaterGateway.getStatus();

  return {
    state: next.state,
    version: next.version ?? null,
    percent: next.percent ?? null,
    message: next.message ?? null,
    lastCheckedAt: next.lastCheckedAt ?? current.lastCheckedAt,
  };
}

export function setUpdateStatus(status: AppUpdateStatus, debugUpdater: (message: string, payload?: unknown) => void) {
  const current = updaterGateway.getStatus();
  debugUpdater('status', {
    from: current,
    to: status,
  });
  updaterGateway.setStatus(status);
}

export function normalizeUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('failed to unpack')
    || message.includes('failed to extract')
    || message.includes('tauri_updated_app')
  ) {
    return '업데이트 파일 적용 실패';
  }

  if (
    message.includes('latest.json')
    || message.includes('404')
    || message.includes('Not Found')
  ) {
    return '메타데이터 없음';
  }

  return message || '오류';
}

export function formatUpdateStatusMessage(status: AppUpdateStatus) {
  if (status.state === 'checking') {
    return '확인 중';
  }

  if (status.state === 'ready_to_install') {
    return '준비됨';
  }

  if (status.state === 'available_downloading') {
    return '다운로드 중';
  }

  if (status.state === 'installing') {
    return '적용 중';
  }

  if (status.state === 'idle' && status.message === '최신') {
    return '최신 버전';
  }

  return status.message;
}

export function getHeaderUpdateActionLabel(status: AppUpdateStatus) {
  if (status.state === 'ready_to_install') {
    return '업데이트';
  }

  if (status.state === 'installing') {
    return '업데이트 중';
  }

  return null;
}
