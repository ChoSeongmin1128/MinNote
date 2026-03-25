import { useEffect } from 'react';
import { appUseCases, syncEventPort } from '../app/runtime';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useSyncEventListener() {
  const icloudSyncEnabled = useWorkspaceStore((state) => state.icloudSyncEnabled);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info('[icloud] subscribe:start', { icloudSyncEnabled });
    }
    let unlistenFn: (() => void) | null = null;
    let disposed = false;

    void syncEventPort.subscribe((message) => {
      if (import.meta.env.DEV) {
        console.info('[icloud] event', message);
      }
      void appUseCases.handleSyncEventMessage(message);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlistenFn = fn;
        if (import.meta.env.DEV) {
          console.info('[icloud] subscribe:ready', { icloudSyncEnabled });
        }
        if (icloudSyncEnabled) {
          if (import.meta.env.DEV) {
            console.info('[icloud] refresh:requested-after-subscribe');
          }
          void appUseCases.refreshIcloudSync();
        }
      }
    });

    return () => {
      disposed = true;
      unlistenFn?.();
    };
  }, [icloudSyncEnabled]);
}
