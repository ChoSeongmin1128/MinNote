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
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const lastForegroundSyncAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled || icloudSyncStatus.state === 'offline') {
      return;
    }

    const timer = window.setTimeout(() => {
      void runICloudSync();
    }, INITIAL_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);

  useEffect(() => {
    if (
      !isReady ||
      !icloudSyncStatus.enabled ||
      !currentDocument ||
      icloudSyncStatus.state === 'checking' ||
      icloudSyncStatus.state === 'syncing'
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runICloudSync();
    }, LOCAL_CHANGE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentDocument, icloudSyncStatus.enabled, icloudSyncStatus.state, isReady, runICloudSync]);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      void runICloudSync();
    }, PERIODIC_SYNC_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);

  useEffect(() => {
    if (!isReady || !icloudSyncStatus.enabled) {
      return;
    }

    const maybeRunForegroundSync = () => {
      const now = Date.now();
      const lastSyncAt = icloudSyncStatus.lastSyncSucceededAtMs ?? 0;
      const recentEnough =
        now - Math.max(lastSyncAt, lastForegroundSyncAtRef.current) < FOREGROUND_MIN_INTERVAL_MS;
      if (recentEnough) {
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
  }, [icloudSyncStatus.enabled, icloudSyncStatus.lastSyncSucceededAtMs, isReady, runICloudSync]);

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
