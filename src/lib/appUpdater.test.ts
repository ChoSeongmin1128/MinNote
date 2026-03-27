import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_CHECK_TIMEOUT_MS,
  APP_UPDATE_DOWNLOAD_TIMEOUT_MS,
  APP_UPDATE_INSTALL_TIMEOUT_MS,
  applyPreparedUpdate,
  __resetAppUpdaterForTests,
  runUpdateCheck,
} from './appUpdater';
import { useUpdaterStore } from '../stores/updaterStore';

const { checkMock, relaunchMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  relaunchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: checkMock,
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: relaunchMock,
}));

describe('runUpdateCheck', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    useUpdaterStore.setState({
      appUpdateStatus: {
        state: 'idle',
        version: null,
        percent: null,
        message: null,
        lastCheckedAt: null,
      },
    });
    checkMock.mockReset();
    relaunchMock.mockReset();
    __resetAppUpdaterForTests();
  });

  afterEach(() => {
    __resetAppUpdaterForTests();
  });

  it('keeps the updater idle with a latest-version message when no update exists', async () => {
    checkMock.mockResolvedValueOnce(null);

    await runUpdateCheck();

    expect(checkMock).toHaveBeenCalledWith({ timeout: APP_UPDATE_CHECK_TIMEOUT_MS });
    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'idle',
      message: '최신',
    });
  });

  it('downloads an available update in the background and marks it ready to install', async () => {
    const downloadMock = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 25 } });
      onEvent({ event: 'Progress', data: { chunkLength: 75 } });
      onEvent({ event: 'Finished' });
    });

    checkMock.mockResolvedValueOnce({
      version: '1.1.0',
      download: downloadMock,
      install: vi.fn(),
    });

    await runUpdateCheck();

    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(useUpdaterStore.getState().appUpdateStatus).toEqual({
      state: 'ready_to_install',
      version: '1.1.0',
      percent: 100,
      message: null,
      lastCheckedAt: expect.any(Number),
    });
  });

  it('maps latest.json 404 errors to a release metadata message', async () => {
    checkMock.mockRejectedValueOnce(new Error('HTTP 404 Not Found: latest.json'));

    await runUpdateCheck();

    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '메타데이터 없음',
    });
  });

  it('maps updater timeout errors to a short message', async () => {
    checkMock.mockRejectedValueOnce(new Error('업데이트 응답 지연'));

    await runUpdateCheck();

    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '업데이트 응답 지연',
    });
  });

  it('marks the updater as error when the updater check hangs longer than the watchdog', async () => {
    vi.useFakeTimers();
    checkMock.mockImplementationOnce(() => new Promise(() => {}));

    const pending = runUpdateCheck();
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_TIMEOUT_MS + 1_001);
    await pending;

    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '업데이트 응답 지연',
    });
  });

  it('marks the updater as error when the download stalls and allows a retry', async () => {
    vi.useFakeTimers();

    checkMock
      .mockResolvedValueOnce({
        version: '1.1.0',
        download: vi.fn(() => new Promise(() => {})),
        install: vi.fn(),
      })
      .mockResolvedValueOnce(null);

    const pending = runUpdateCheck();
    await vi.advanceTimersByTimeAsync(APP_UPDATE_DOWNLOAD_TIMEOUT_MS + 1);
    await pending;

    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '업데이트 다운로드 지연',
    });

    await runUpdateCheck();

    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'idle',
      message: '최신',
    });
  });

  it('relaunches the app after a prepared update is applied', async () => {
    const installMock = vi.fn(async () => {});

    checkMock.mockResolvedValueOnce({
      version: '1.1.0',
      download: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'Finished' });
      }),
      install: installMock,
    });

    await runUpdateCheck();
    await applyPreparedUpdate();

    expect(installMock).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it('marks the updater as error when install stalls', async () => {
    vi.useFakeTimers();

    checkMock.mockResolvedValueOnce({
      version: '1.1.0',
      download: vi.fn(async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'Finished' });
      }),
      install: vi.fn(() => new Promise(() => {})),
    });

    await runUpdateCheck();

    const pending = applyPreparedUpdate();
    await vi.advanceTimersByTimeAsync(APP_UPDATE_INSTALL_TIMEOUT_MS + 1);
    await pending;

    expect(useUpdaterStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '업데이트 적용 지연',
    });
  });
});
