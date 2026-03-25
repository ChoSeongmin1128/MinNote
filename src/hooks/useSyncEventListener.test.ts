import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  handleSyncEventMessage: vi.fn(),
  refreshIcloudSync: vi.fn(),
  icloudSyncEnabled: false,
}));

vi.mock('../app/runtime', () => ({
  syncEventPort: { subscribe: mocks.subscribe },
  appUseCases: {
    handleSyncEventMessage: mocks.handleSyncEventMessage,
    refreshIcloudSync: mocks.refreshIcloudSync,
  },
}));

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (state: { icloudSyncEnabled: boolean }) => boolean) =>
    selector({ icloudSyncEnabled: mocks.icloudSyncEnabled }),
}));

import { useSyncEventListener } from './useSyncEventListener';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.icloudSyncEnabled = false;
});

describe('useSyncEventListener', () => {
  it('calls unlisten immediately if component unmounts before subscribe resolves', async () => {
    const unlisten = vi.fn();
    let resolveSubscribe!: (fn: () => void) => void;
    mocks.subscribe.mockReturnValue(new Promise<() => void>((resolve) => { resolveSubscribe = resolve; }));

    const { unmount } = renderHook(() => useSyncEventListener());
    unmount();

    resolveSubscribe(unlisten);
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('calls unlisten on unmount when subscribe resolves before unmount', async () => {
    const unlisten = vi.fn();
    mocks.subscribe.mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useSyncEventListener());
    await Promise.resolve();

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('requests icloud refresh after subscribe when enabled', async () => {
    mocks.icloudSyncEnabled = true;
    mocks.subscribe.mockResolvedValue(vi.fn());

    renderHook(() => useSyncEventListener());
    await Promise.resolve();

    expect(mocks.refreshIcloudSync).toHaveBeenCalledTimes(1);
  });
});
