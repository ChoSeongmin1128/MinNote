import { useCallback, useEffect, useState } from 'react';
import { previewWindowOpacityPercent, setWindowOpacityPercent } from '../app/actions';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useWindowOpacityControl() {
  const persistedOpacity = useWorkspaceStore((state) => state.windowOpacityPercent);
  const [draftOpacity, setDraftOpacity] = useState(persistedOpacity);

  useEffect(() => {
    setDraftOpacity(persistedOpacity);
  }, [persistedOpacity]);

  const previewOpacity = useCallback(async (percent: number) => {
    setDraftOpacity(percent);

    try {
      await previewWindowOpacityPercent(percent);
    } catch {
      setDraftOpacity(useWorkspaceStore.getState().windowOpacityPercent);
    }
  }, []);

  const commitOpacity = useCallback(async (percent: number) => {
    const nextPercent = Math.round(percent);
    if (nextPercent === useWorkspaceStore.getState().windowOpacityPercent) {
      setDraftOpacity(nextPercent);
      return nextPercent;
    }

    try {
      const result = await setWindowOpacityPercent(nextPercent);
      setDraftOpacity(result);
      return result;
    } catch {
      const fallback = useWorkspaceStore.getState().windowOpacityPercent;
      setDraftOpacity(fallback);
      return fallback;
    }
  }, []);

  return {
    draftOpacity,
    persistedOpacity,
    setDraftOpacity,
    previewOpacity,
    commitOpacity,
  };
}
