import { useEffect, useRef } from 'react';
import { usePreferencesController } from '../app/controllers';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const INITIAL_DELAY_MS = 2_000;
const TEXT_CHANGE_DEBOUNCE_MS = 1_500;
const STRUCTURAL_CHANGE_DEBOUNCE_MS = 250;
const ACTIVE_PERIODIC_SYNC_MS = 30_000;
const BACKGROUND_PERIODIC_SYNC_MS = 5 * 60_000;
const FOREGROUND_MIN_INTERVAL_MS = 30_000;

export function useICloudSync(isReady: boolean) {
  const { runICloudSync } = usePreferencesController();
  const icloudSyncStatus = useWorkspaceStore((state) => state.icloudSyncStatus);
  const lastTextMutationAt = useDocumentSessionStore((state) => state.lastTextMutationAt);
  const lastStructuralMutationAt = useDocumentSessionStore((state) => state.lastStructuralMutationAt);
  const lastForegroundSyncAtRef = useRef<number>(0);
  const initialSyncQueuedRef = useRef(false);
  const lastQueuedTextTriggerRef = useRef<string | null>(null);
  const lastQueuedStructuralTriggerRef = useRef<string | null>(null);

  useEffect(() => {
    if (icloudSyncStatus.enabled) {
      return;
    }
    initialSyncQueuedRef.current = false;
    lastQueuedTextTriggerRef.current = null;
    lastQueuedStructuralTriggerRef.current = null;
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
      void runICloudSync('initial');
    }, INITIAL_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);

  useEffect(() => {
    const structuralMutationIsUnsynced =
      lastStructuralMutationAt != null &&
      (icloudSyncStatus.lastSyncSucceededAtMs ?? 0) < lastStructuralMutationAt;

    if (
      !isReady ||
      !icloudSyncStatus.enabled ||
      !structuralMutationIsUnsynced ||
      icloudSyncStatus.state === 'checking' ||
      icloudSyncStatus.state === 'syncing' ||
      icloudSyncStatus.state === 'offline'
    ) {
      return;
    }

    const triggerKey = `${lastStructuralMutationAt ?? 0}:${icloudSyncStatus.pendingOperationCount}`;
    if (lastQueuedStructuralTriggerRef.current === triggerKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastQueuedStructuralTriggerRef.current = triggerKey;
      void runICloudSync('structural_mutation');
    }, STRUCTURAL_CHANGE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    icloudSyncStatus.enabled,
    icloudSyncStatus.lastSyncSucceededAtMs,
    icloudSyncStatus.pendingOperationCount,
    icloudSyncStatus.state,
    isReady,
    lastStructuralMutationAt,
    runICloudSync,
  ]);

  useEffect(() => {
    const textMutationIsUnsynced =
      lastTextMutationAt != null &&
      (icloudSyncStatus.lastSyncSucceededAtMs ?? 0) < lastTextMutationAt;
    const structuralMutationIsUnsynced =
      lastStructuralMutationAt != null &&
      (icloudSyncStatus.lastSyncSucceededAtMs ?? 0) < lastStructuralMutationAt;

    if (
      !isReady ||
      !icloudSyncStatus.enabled ||
      !textMutationIsUnsynced ||
      structuralMutationIsUnsynced ||
      icloudSyncStatus.state === 'checking' ||
      icloudSyncStatus.state === 'syncing' ||
      icloudSyncStatus.state === 'offline'
    ) {
      return;
    }

    const triggerKey = `${lastTextMutationAt ?? 0}:${icloudSyncStatus.pendingOperationCount}`;
    if (lastQueuedTextTriggerRef.current === triggerKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastQueuedTextTriggerRef.current = triggerKey;
      void runICloudSync('text_mutation');
    }, TEXT_CHANGE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    icloudSyncStatus.enabled,
    icloudSyncStatus.lastSyncSucceededAtMs,
    icloudSyncStatus.pendingOperationCount,
    icloudSyncStatus.state,
    isReady,
    lastStructuralMutationAt,
    lastTextMutationAt,
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

      if (icloudSyncStatus.state === 'offline') {
        return;
      }

      const now = Date.now();
      const lastSyncAt = icloudSyncStatus.lastSyncSucceededAtMs ?? 0;
      const hasPendingChanges = icloudSyncStatus.pendingOperationCount > 0;
      const minInterval =
        document.visibilityState === 'visible'
          ? ACTIVE_PERIODIC_SYNC_MS
          : BACKGROUND_PERIODIC_SYNC_MS;

      if (!hasPendingChanges && now - lastSyncAt < minInterval) {
        return;
      }

      void runICloudSync('periodic');
    }, ACTIVE_PERIODIC_SYNC_MS);

    return () => {
      window.clearInterval(interval);
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
      void runICloudSync('foreground');
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
      void runICloudSync('online');
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [icloudSyncStatus.enabled, isReady, runICloudSync]);
}
