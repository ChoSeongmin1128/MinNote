import { useEffect } from 'react';
import { appUseCases, syncEventPort } from '../app/runtime';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useSyncEventListener() {
  const icloudSyncEnabled = useWorkspaceStore((state) => state.icloudSyncEnabled);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let disposed = false;

    void syncEventPort.subscribe((message) => {
      void appUseCases.handleSyncEventMessage(message);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlistenFn = fn;
        if (icloudSyncEnabled) {
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
