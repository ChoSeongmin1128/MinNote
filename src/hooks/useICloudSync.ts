import { useEffect, useRef } from 'react';
import { usePreferencesController } from '../app/controllers';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const INITIAL_DELAY_MS = 2_000;
const LOCAL_CHANGE_DEBOUNCE_MS = 8_000;
const PERIODIC_SYNC_MS = 5 * 60_000;
const FOREGROUND_MIN_INTERVAL_MS = 60_000;

export function useICloudSync(isReady: boolean) {
  const { runICloudSync } = usePreferencesController();
  const icloudSyncStatus = useWorkspaceStore((state) => state.icloudSyncStatus);
  const lastLocalMutationAt = useDocumentSessionStore((state) => state.lastLocalMutationAt);
  const lastForegroundSyncAtRef = useRef<number>(0);
  const initialSyncQueuedRef = useRef(false);
  const lastQueuedLocalTriggerRef = useRef<string | null>(null);

  useEffect(() => {
    if (icloudSyncStatus.enabled) {
      return;
    }
    initialSyncQueuedRef.current = false;
    lastQueuedLocalTriggerRef.current = null;
  }, [icloudSyncStatus.enabled]);

  useEffect(() => {
    if (
      !isReady ||
      !icloudSyncStatus.enabled ||
      icloudSyncStatus.state === 'offline' ||
      initialSyncQueuedRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (icloudSyncStatus.state === 'checking' || icloudSyncStatus.state === 'syncing') {
        return;
      }
      initialSyncQueuedRef.current = true;
      void runICloudSync();
    }, INITIAL_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);

  useEffect(() => {
    const mutationIsUnsynced =
      lastLocalMutationAt != null &&
      (icloudSyncStatus.lastSyncSucceededAtMs ?? 0) < lastLocalMutationAt;

    if (
      !isReady ||
      !icloudSyncStatus.enabled ||
      (!mutationIsUnsynced && icloudSyncStatus.pendingOperationCount === 0) ||
      icloudSyncStatus.state === 'checking' ||
      icloudSyncStatus.state === 'syncing' ||
      icloudSyncStatus.state === 'offline'
    ) {
      return;
    }

    const triggerKey = `${lastLocalMutationAt ?? 0}:${icloudSyncStatus.pendingOperationCount}`;
    if (lastQueuedLocalTriggerRef.current === triggerKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastQueuedLocalTriggerRef.current = triggerKey;
      void runICloudSync();
    }, LOCAL_CHANGE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    icloudSyncStatus.enabled,
    icloudSyncStatus.lastSyncSucceededAtMs,
    icloudSyncStatus.pendingOperationCount,
    icloudSyncStatus.state,
    isReady,
    lastLocalMutationAt,
    runICloudSync,
  ]);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      if (icloudSyncStatus.state === 'checking' || icloudSyncStatus.state === 'syncing') {
        return;
      }
      void runICloudSync();
    }, PERIODIC_SYNC_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [icloudSyncStatus.enabled, icloudSyncStatus.state, isReady, runICloudSync]);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled) {
      return;
    }

    const maybeRunForegroundSync = () => {
      if (
        icloudSyncStatus.state === 'checking' ||
        icloudSyncStatus.state === 'syncing' ||
        icloudSyncStatus.state === 'offline'
      ) {
        return;
      }

      const now = Date.now();
      const lastSyncAt = icloudSyncStatus.lastSyncSucceededAtMs ?? 0;
      const hasPendingChanges = icloudSyncStatus.pendingOperationCount > 0;
      const recentEnough =
        now - Math.max(lastSyncAt, lastForegroundSyncAtRef.current) < FOREGROUND_MIN_INTERVAL_MS;
      if (recentEnough && !hasPendingChanges) {
        return;
      }

      lastForegroundSyncAtRef.current = now;
      void runICloudSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeRunForegroundSync();
      }
    };

    window.addEventListener('focus', maybeRunForegroundSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', maybeRunForegroundSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    icloudSyncStatus.enabled,
    icloudSyncStatus.lastSyncSucceededAtMs,
    icloudSyncStatus.pendingOperationCount,
    icloudSyncStatus.state,
    isReady,
    runICloudSync,
  ]);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled) {
      return;
    }

    const handleOnline = () => {
      void runICloudSync();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);
}
