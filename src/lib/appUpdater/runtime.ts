import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { updaterGateway } from '../../adapters/updaterGateway';
import {
  buildStatus,
  normalizeUpdateError,
  setUpdateStatus,
} from './status';
import {
  APP_UPDATE_CHECK_TIMEOUT_MS,
  APP_UPDATE_DOWNLOAD_TIMEOUT_MS,
  APP_UPDATE_INSTALL_TIMEOUT_MS,
  debugUpdater,
  withTimeout,
} from './shared';
import type { DownloadedUpdate, PreparedUpdateAction } from './shared';

let pendingCheck: Promise<void> | null = null;
let preparedUpdateAction: PreparedUpdateAction = null;
let downloadedUpdate: DownloadedUpdate | null = null;

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
  }), debugUpdater);

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
      }, debugUpdater);
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
    }, debugUpdater);

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
          }, debugUpdater);
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
          }, debugUpdater);
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
          }, debugUpdater);
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
      }, debugUpdater);
    }
  } catch (error) {
    abandoned = true;
    console.error('[updater] check failed', {
      source,
      error,
    });
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
    }, debugUpdater);
  }
}

export async function runUpdateCheck() {
  return runUpdateCheckFrom('unknown');
}

export async function runUpdateCheckFrom(source: string) {
  const current = updaterGateway.getStatus();
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
    const current = updaterGateway.getStatus();
    debugUpdater('install:start', { version: current.version });
    setUpdateStatus(buildStatus({
      state: 'installing',
      version: current.version,
      percent: null,
      message: null,
    }), debugUpdater);
    await withTimeout(
      preparedUpdateAction(),
      APP_UPDATE_INSTALL_TIMEOUT_MS,
      '업데이트 적용 지연',
    );
  } catch (error) {
    console.error('[updater] install failed', {
      error,
    });
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
    }), debugUpdater);
  }
}

export function __resetAppUpdaterForTests() {
  pendingCheck = null;
  preparedUpdateAction = null;
  downloadedUpdate = null;
}
