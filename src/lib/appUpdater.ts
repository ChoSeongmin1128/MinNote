import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; body: string | null }
  | { state: 'downloading'; percent: number }
  | { state: 'ready' }
  | { state: 'up-to-date' }
  | { state: 'error'; message: string };

type StatusCallback = (status: UpdateStatus) => void;

function normalizeUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('latest.json')
    || message.includes('404')
    || message.includes('Not Found')
  ) {
    return '업데이트 메타데이터를 찾지 못했습니다. 릴리스에 latest.json이 업로드되어 있는지 확인해 주세요.';
  }

  return message || '업데이트 확인 중 오류가 발생했습니다.';
}

export async function checkForUpdate(onStatus: StatusCallback) {
  onStatus({ state: 'checking' });

  try {
    const update = await check();

    if (!update) {
      onStatus({ state: 'up-to-date' });
      return;
    }

    onStatus({
      state: 'available',
      version: update.version,
      body: update.body ?? null,
    });

    return {
      async install() {
        let downloaded = 0;
        let total = 0;

        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
            onStatus({ state: 'downloading', percent: 0 });
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            onStatus({ state: 'downloading', percent });
          } else if (event.event === 'Finished') {
            onStatus({ state: 'ready' });
          }
        });
      },
      async relaunch() {
        await relaunch();
      },
    };
  } catch (error) {
    onStatus({
      state: 'error',
      message: normalizeUpdateError(error),
    });
  }
}
