import { useCallback, useEffect, useState } from 'react';
import { desktopApi } from '../lib/desktopApi';
import type { ICloudSyncDebugInfoDto } from '../lib/types';

export function useICloudSyncDebugInfo(isOpen: boolean) {
  const [debugInfo, setDebugInfo] = useState<ICloudSyncDebugInfoDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await desktopApi.getICloudSyncDebugInfo();
      setDebugInfo(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'iCloud 디버그 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void refresh();
  }, [isOpen, refresh]);

  return {
    debugInfo,
    isLoading,
    error,
    refresh,
  };
}
