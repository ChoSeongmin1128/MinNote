import { useCallback, useEffect, useState } from 'react';
import { usePreferencesController } from '../app/controllers';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { applyEditorTypographyCssVars } from '../lib/editorTypography';

export function useEditorTypographyControl() {
  const { setBodyFontSizePx, setCodeFontSizePx } = usePreferencesController();
  const bodyFontFamily = useWorkspaceStore((state) => state.bodyFontFamily);
  const persistedBodyFontSizePx = useWorkspaceStore((state) => state.bodyFontSizePx);
  const codeFontFamily = useWorkspaceStore((state) => state.codeFontFamily);
  const persistedCodeFontSizePx = useWorkspaceStore((state) => state.codeFontSizePx);
  const [draftBodyFontSizePx, setDraftBodyFontSizePx] = useState(persistedBodyFontSizePx);
  const [draftCodeFontSizePx, setDraftCodeFontSizePx] = useState(persistedCodeFontSizePx);

  useEffect(() => {
    setDraftBodyFontSizePx(persistedBodyFontSizePx);
  }, [persistedBodyFontSizePx]);

  useEffect(() => {
    setDraftCodeFontSizePx(persistedCodeFontSizePx);
  }, [persistedCodeFontSizePx]);

  useEffect(() => {
    applyEditorTypographyCssVars(document.documentElement.style, {
      bodyFontFamily,
      bodyFontSizePx: draftBodyFontSizePx,
      codeFontFamily,
      codeFontSizePx: draftCodeFontSizePx,
    });

    return () => {
      applyEditorTypographyCssVars(document.documentElement.style, {
        bodyFontFamily,
        bodyFontSizePx: persistedBodyFontSizePx,
        codeFontFamily,
        codeFontSizePx: persistedCodeFontSizePx,
      });
    };
  }, [
    bodyFontFamily,
    codeFontFamily,
    draftBodyFontSizePx,
    draftCodeFontSizePx,
    persistedBodyFontSizePx,
    persistedCodeFontSizePx,
  ]);

  const previewBodyFontSizePx = useCallback((size: number) => {
    setDraftBodyFontSizePx(size);
  }, []);

  const commitBodyFontSizePx = useCallback(async (size: number) => {
    const nextSize = Math.round(size);
    if (nextSize === persistedBodyFontSizePx) {
      setDraftBodyFontSizePx(nextSize);
      return nextSize;
    }

    try {
      const result = await setBodyFontSizePx(nextSize);
      setDraftBodyFontSizePx(result);
      return result;
    } catch {
      setDraftBodyFontSizePx(persistedBodyFontSizePx);
      return persistedBodyFontSizePx;
    }
  }, [persistedBodyFontSizePx, setBodyFontSizePx]);

  const previewCodeFontSizePx = useCallback((size: number) => {
    setDraftCodeFontSizePx(size);
  }, []);

  const commitCodeFontSizePx = useCallback(async (size: number) => {
    const nextSize = Math.round(size);
    if (nextSize === persistedCodeFontSizePx) {
      setDraftCodeFontSizePx(nextSize);
      return nextSize;
    }

    try {
      const result = await setCodeFontSizePx(nextSize);
      setDraftCodeFontSizePx(result);
      return result;
    } catch {
      setDraftCodeFontSizePx(persistedCodeFontSizePx);
      return persistedCodeFontSizePx;
    }
  }, [persistedCodeFontSizePx, setCodeFontSizePx]);

  return {
    draftBodyFontSizePx,
    draftCodeFontSizePx,
    previewBodyFontSizePx,
    commitBodyFontSizePx,
    previewCodeFontSizePx,
    commitCodeFontSizePx,
  };
}
