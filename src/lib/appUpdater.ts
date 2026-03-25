import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { AppUpdateStatus } from './types';
import { useWorkspaceStore } from '../stores/workspaceStore';

export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const APP_UPDATE_CHECK_TIMEOUT_MS = 15 * 1000;
export const APP_UPDATE_DOWNLOAD_TIMEOUT_MS = 30 * 1000;
export const APP_UPDATE_INSTALL_TIMEOUT_MS = 30 * 1000;

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
const isDev = import.meta.env.DEV;

function debugUpdater(message: string, payload?: unknown) {
  if (!isDev) {
    return;
  }

  if (payload === undefined) {
    console.info(`[updater] ${message}`);
    return;
  }

  console.info(`[updater] ${message}`, payload);
}

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
  const current = useWorkspaceStore.getState().appUpdateStatus;
  debugUpdater('status', {
    from: current,
    to: status,
  });
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

async function performUpdateCheck(source: string) {
  debugUpdater('check:start', { source });
  await closeDownloadedUpdate();
  preparedUpdateAction = null;
  let abandoned = false;
  setUpdateStatus(buildStatus({
    state: 'checking',
    version: null,
    percent: null,
    message: null,
  }));

  try {
    const update = await withTimeout(
      check({ timeout: APP_UPDATE_CHECK_TIMEOUT_MS }),
      APP_UPDATE_CHECK_TIMEOUT_MS + 1_000,
      '업데이트 응답 지연',
    );
    const checkedAt = Date.now();

    if (!update) {
      debugUpdater('check:latest', { source });
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

    await withTimeout(
      update.download((event) => {
        if (abandoned) {
          return;
        }
        debugUpdater('download:event', { source, event });
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
            debugUpdater('install:prepared', { source, version: update.version });
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
      }),
      APP_UPDATE_DOWNLOAD_TIMEOUT_MS,
      '업데이트 다운로드 지연',
    );

    if (!completed) {
      debugUpdater('download:complete-without-finished-event', { source, version: update.version });
      downloadedUpdate = update;
      preparedUpdateAction = async () => {
        debugUpdater('install:prepared', { source, version: update.version });
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
    abandoned = true;
    debugUpdater('check:error', {
      source,
      error: normalizeUpdateError(error),
    });
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
  return runUpdateCheckFrom('unknown');
}

export async function runUpdateCheckFrom(source: string) {
  const current = useWorkspaceStore.getState().appUpdateStatus;
  debugUpdater('check:requested', { source, current });

  if (current.state === 'checking' && pendingCheck) {
    debugUpdater('check:join-pending', { source });
    await pendingCheck;
    return;
  }

  if (current.state === 'available_downloading' || current.state === 'ready_to_install') {
    debugUpdater('check:skipped-active-download-or-ready', { source, current });
    return;
  }

  if (current.state === 'installing') {
    debugUpdater('check:skipped-installing', { source });
    return;
  }

  const nextCheck = performUpdateCheck(source).finally(() => {
    debugUpdater('check:finished', { source });
    if (pendingCheck === nextCheck) {
      pendingCheck = null;
    }
  });

  pendingCheck = nextCheck;
  await nextCheck;
}

export async function applyPreparedUpdate() {
  if (!preparedUpdateAction) {
    debugUpdater('install:skipped-no-prepared-update');
    return;
  }

  try {
    const current = useWorkspaceStore.getState().appUpdateStatus;
    debugUpdater('install:start', { version: current.version });
    setUpdateStatus(buildStatus({
      state: 'installing',
      version: current.version,
      percent: null,
      message: null,
    }));
    await withTimeout(
      preparedUpdateAction(),
      APP_UPDATE_INSTALL_TIMEOUT_MS,
      '업데이트 적용 지연',
    );
  } catch (error) {
    debugUpdater('install:error', {
      error: normalizeUpdateError(error),
    });
    await closeDownloadedUpdate();
    preparedUpdateAction = null;
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
