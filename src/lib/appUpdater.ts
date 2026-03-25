import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { AppUpdateStatus } from './types';
import { useWorkspaceStore } from '../stores/workspaceStore';

export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const APP_UPDATE_CHECK_TIMEOUT_MS = 15 * 1000;

type PreparedUpdateAction = (() => Promise<void>) | null;
type DownloadProgressEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

type DownloadedUpdate = {
  version: string;
  download: (onEvent?: (event: DownloadProgressEvent) => void) => Promise<void>;
  install: () => Promise<void>;
  close?: () => Promise<void>;
};

let pendingCheck: Promise<void> | null = null;
let preparedUpdateAction: PreparedUpdateAction = null;
let downloadedUpdate: DownloadedUpdate | null = null;

function buildStatus(next: Partial<AppUpdateStatus> & Pick<AppUpdateStatus, 'state'>): AppUpdateStatus {
  const current = useWorkspaceStore.getState().appUpdateStatus;

  return {
    state: next.state,
    version: next.version ?? null,
    percent: next.percent ?? null,
    message: next.message ?? null,
    lastCheckedAt: next.lastCheckedAt ?? current.lastCheckedAt,
  };
}

function setUpdateStatus(status: AppUpdateStatus) {
  useWorkspaceStore.getState().setAppUpdateStatus(status);
}

function normalizeUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('latest.json')
    || message.includes('404')
    || message.includes('Not Found')
  ) {
    return '메타데이터 없음';
  }

  return message || '오류';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function closeDownloadedUpdate() {
  if (!downloadedUpdate?.close) {
    downloadedUpdate = null;
    return;
  }

  try {
    await downloadedUpdate.close();
  } catch {
    // Updater resource cleanup failure should not block the next check.
  } finally {
    downloadedUpdate = null;
  }
}

export function formatUpdateStatusMessage(status: AppUpdateStatus) {
  if (status.state === 'checking') {
    return '확인 중';
  }

  if (status.state === 'available_downloading') {
    if (typeof status.percent === 'number' && status.percent > 0) {
      return `다운로드 중 ${status.percent}%`;
    }

    return '다운로드 중';
  }

  if (status.state === 'ready_to_install') {
    return status.version ? `${status.version} 준비됨` : '준비됨';
  }

  if (status.state === 'idle' && status.message === '최신') {
    return '최신 버전';
  }

  return status.message;
}

export function getHeaderUpdateActionLabel(status: AppUpdateStatus) {
  if (status.state === 'available_downloading') {
    if (typeof status.percent === 'number' && status.percent > 0) {
      return `업데이트 다운로드 중 ${status.percent}%`;
    }

    return '업데이트 다운로드 중';
  }

  if (status.state === 'ready_to_install') {
    return '업데이트 적용';
  }

  return null;
}

async function performUpdateCheck() {
  await closeDownloadedUpdate();
  preparedUpdateAction = null;
  setUpdateStatus(buildStatus({
    state: 'checking',
    version: null,
    percent: null,
    message: null,
  }));

  try {
    const update = await withTimeout(
      check(),
      APP_UPDATE_CHECK_TIMEOUT_MS,
      '업데이트 응답 지연',
    );
    const checkedAt = Date.now();

    if (!update) {
      setUpdateStatus({
        state: 'idle',
        version: null,
        percent: null,
        message: '최신',
        lastCheckedAt: checkedAt,
      });
      return;
    }

    let downloaded = 0;
    let total = 0;
    let completed = false;

    setUpdateStatus({
      state: 'available_downloading',
      version: update.version,
      percent: null,
      message: null,
      lastCheckedAt: checkedAt,
    });

    await update.download((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0;
        downloaded = 0;
        setUpdateStatus({
          state: 'available_downloading',
          version: update.version,
          percent: 0,
          message: null,
          lastCheckedAt: checkedAt,
        });
        return;
      }

      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
        setUpdateStatus({
          state: 'available_downloading',
          version: update.version,
          percent,
          message: null,
          lastCheckedAt: checkedAt,
        });
        return;
      }

      if (event.event === 'Finished') {
        completed = true;
        downloadedUpdate = update;
        preparedUpdateAction = async () => {
          await update.install();
          await closeDownloadedUpdate();
          await relaunch();
        };
        setUpdateStatus({
          state: 'ready_to_install',
          version: update.version,
          percent: 100,
          message: null,
          lastCheckedAt: checkedAt,
        });
      }
    });

    if (!completed) {
      downloadedUpdate = update;
      preparedUpdateAction = async () => {
        await update.install();
        await closeDownloadedUpdate();
        await relaunch();
      };
      setUpdateStatus({
        state: 'ready_to_install',
        version: update.version,
        percent: 100,
        message: null,
        lastCheckedAt: checkedAt,
      });
    }
  } catch (error) {
    await closeDownloadedUpdate();
    preparedUpdateAction = null;
    setUpdateStatus({
      state: 'error',
      version: null,
      percent: null,
      message: normalizeUpdateError(error),
      lastCheckedAt: Date.now(),
    });
  }
}

export async function runUpdateCheck() {
  const current = useWorkspaceStore.getState().appUpdateStatus;

  if (current.state === 'checking' && pendingCheck) {
    await pendingCheck;
    return;
  }

  if (current.state === 'available_downloading' || current.state === 'ready_to_install') {
    return;
  }

  const nextCheck = performUpdateCheck().finally(() => {
    if (pendingCheck === nextCheck) {
      pendingCheck = null;
    }
  });

  pendingCheck = nextCheck;
  await nextCheck;
}

export async function applyPreparedUpdate() {
  if (!preparedUpdateAction) {
    return;
  }

  try {
    await preparedUpdateAction();
  } catch (error) {
    setUpdateStatus(buildStatus({
      state: 'error',
      version: null,
      percent: null,
      message: normalizeUpdateError(error),
      lastCheckedAt: Date.now(),
    }));
  }
}

export function __resetAppUpdaterForTests() {
  pendingCheck = null;
  preparedUpdateAction = null;
  downloadedUpdate = null;
}
