import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_CHECK_TIMEOUT_MS,
  applyPreparedUpdate,
  __resetAppUpdaterForTests,
  runUpdateCheck,
} from './appUpdater';
import { useWorkspaceStore } from '../stores/workspaceStore';

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
    useWorkspaceStore.setState({
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

    expect(useWorkspaceStore.getState().appUpdateStatus).toMatchObject({
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
    expect(useWorkspaceStore.getState().appUpdateStatus).toEqual({
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

    expect(useWorkspaceStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '메타데이터 없음',
    });
  });

  it('fails fast when update metadata lookup stalls', async () => {
    vi.useFakeTimers();
    checkMock.mockImplementationOnce(() => new Promise(() => {}));

    const pending = runUpdateCheck();
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_TIMEOUT_MS + 1);
    await pending;

    expect(useWorkspaceStore.getState().appUpdateStatus).toMatchObject({
      state: 'error',
      message: '업데이트 응답 지연',
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
});
