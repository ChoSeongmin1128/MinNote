import type { BackendPort } from '../../ports/backendPort';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { normalizeErrorMessage } from '../shared/errors';

interface PreferencesUseCaseDeps {
  backend: BackendPort;
  preferences: PreferencesGateway;
  workspace: WorkspaceGateway;
}

export function createPreferencesUseCases({
  backend,
  preferences,
  workspace,
}: PreferencesUseCaseDeps) {
  let opacityRequestToken = 0;

  async function setThemeMode(themeMode: Parameters<BackendPort['setThemeMode']>[0]) {
    try {
      const nextThemeMode = await backend.setThemeMode(themeMode);
      workspace.clearError();
      preferences.setThemeMode(nextThemeMode);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '테마를 변경하지 못했습니다.'));
    }
  }

  async function setDefaultBlockTintPreset(preset: Parameters<BackendPort['setDefaultBlockTintPreset']>[0]) {
    try {
      const nextPreset = await backend.setDefaultBlockTintPreset(preset);
      workspace.clearError();
      preferences.setDefaultBlockTintPreset(nextPreset);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '기본 블록 색상쌍을 변경하지 못했습니다.'));
    }
  }

  async function setDefaultDocumentSurfaceTonePreset(
    preset: Parameters<BackendPort['setDefaultDocumentSurfaceTonePreset']>[0],
  ) {
    try {
      const nextPreset = await backend.setDefaultDocumentSurfaceTonePreset(preset);
      workspace.clearError();
      preferences.setDefaultDocumentSurfaceTonePreset(nextPreset);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '기본 문서 배경 톤을 변경하지 못했습니다.'));
    }
  }

  async function setDefaultBlockKind(kind: Parameters<BackendPort['setDefaultBlockKind']>[0]) {
    try {
      const result = await backend.setDefaultBlockKind(kind);
      workspace.clearError();
      preferences.setDefaultBlockKind(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '기본 블록 종류를 변경하지 못했습니다.'));
    }
  }

  async function setBodyFontFamily(fontFamily: Parameters<BackendPort['setBodyFontFamily']>[0]) {
    try {
      const result = await backend.setBodyFontFamily(fontFamily);
      workspace.clearError();
      preferences.setBodyFontFamily(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '본문 글꼴을 변경하지 못했습니다.'));
    }
  }

  async function setBodyFontSizePx(size: Parameters<BackendPort['setBodyFontSizePx']>[0]) {
    try {
      const result = await backend.setBodyFontSizePx(size);
      workspace.clearError();
      preferences.setBodyFontSizePx(result);
      return result;
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '본문 글자 크기를 변경하지 못했습니다.'));
      throw error;
    }
  }

  async function setCodeFontFamily(fontFamily: Parameters<BackendPort['setCodeFontFamily']>[0]) {
    try {
      const result = await backend.setCodeFontFamily(fontFamily);
      workspace.clearError();
      preferences.setCodeFontFamily(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '코드 글꼴을 변경하지 못했습니다.'));
    }
  }

  async function setCodeFontSizePx(size: Parameters<BackendPort['setCodeFontSizePx']>[0]) {
    try {
      const result = await backend.setCodeFontSizePx(size);
      workspace.clearError();
      preferences.setCodeFontSizePx(result);
      return result;
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '코드 글자 크기를 변경하지 못했습니다.'));
      throw error;
    }
  }

  async function setMenuBarIconEnabled(enabled: boolean) {
    try {
      const result = await backend.setMenuBarIconEnabled(enabled);
      workspace.clearError();
      preferences.setMenuBarIconEnabled(result);
      preferences.setMenuBarIconError(null);
    } catch (error) {
      const message = normalizeErrorMessage(error, '메뉴바 아이콘 설정을 변경하지 못했습니다.');
      workspace.setError(message);
      preferences.setMenuBarIconError(message);
    }
  }

  async function setAlwaysOnTopEnabled(enabled: boolean) {
    const previous = preferences.getAlwaysOnTopEnabled();
    preferences.setAlwaysOnTopEnabled(enabled);
    preferences.setWindowPreferenceError(null);

    try {
      const result = await backend.setAlwaysOnTopEnabled(enabled);
      workspace.clearError();
      preferences.setAlwaysOnTopEnabled(result);
      preferences.setWindowPreferenceError(null);
    } catch (error) {
      preferences.setAlwaysOnTopEnabled(previous);
      const message = normalizeErrorMessage(error, '항상 위에 고정 설정을 변경하지 못했습니다.');
      workspace.setError(message);
      preferences.setWindowPreferenceError(message);
      throw error;
    }
  }

  async function previewWindowOpacityPercent(percent: number) {
    try {
      return await backend.previewWindowOpacityPercent(percent);
    } catch (error) {
      const message = normalizeErrorMessage(error, '창 투명도를 미리보기하지 못했습니다.');
      workspace.setError(message);
      preferences.setWindowPreferenceError(message);
      throw error;
    }
  }

  async function setWindowOpacityPercent(percent: number) {
    const previous = preferences.getWindowOpacityPercent();
    const requestToken = ++opacityRequestToken;

    try {
      const result = await backend.setWindowOpacityPercent(percent);
      if (requestToken !== opacityRequestToken) {
        return preferences.getWindowOpacityPercent();
      }
      workspace.clearError();
      preferences.setWindowOpacityPercent(result);
      preferences.setWindowPreferenceError(null);
      return result;
    } catch (error) {
      if (requestToken !== opacityRequestToken) {
        return preferences.getWindowOpacityPercent();
      }
      preferences.setWindowOpacityPercent(previous);
      const message = normalizeErrorMessage(error, '창 투명도를 변경하지 못했습니다.');
      workspace.setError(message);
      preferences.setWindowPreferenceError(message);
      throw error;
    }
  }

  async function setGlobalToggleShortcut(shortcut: string | null) {
    preferences.setGlobalShortcutError(null);

    try {
      const result = await backend.setGlobalToggleShortcut(shortcut);
      workspace.clearError();
      preferences.setGlobalToggleShortcut(result);
      preferences.setGlobalShortcutError(null);
      return result;
    } catch (error) {
      const message = normalizeErrorMessage(error, '전역 단축키를 등록하지 못했습니다.');
      workspace.setError(message);
      preferences.setGlobalShortcutError(message);
      throw new Error(message);
    }
  }

  async function setICloudSyncEnabled(enabled: boolean) {
    const previous = preferences.getICloudSyncStatus();
    preferences.setICloudSyncStatus({
      ...previous,
      enabled,
      state: enabled ? 'checking' : 'disabled',
      lastErrorCode: enabled ? previous.lastErrorCode : null,
      lastErrorMessage: enabled ? previous.lastErrorMessage : null,
    });

    try {
      const result = await backend.setICloudSyncEnabled(enabled);
      workspace.clearError();
      preferences.setICloudSyncStatus(result);
      return result;
    } catch (error) {
      preferences.setICloudSyncStatus(previous);
      const message = normalizeErrorMessage(error, 'iCloud 동기화 설정을 변경하지 못했습니다.');
      workspace.setError(message);
      throw new Error(message);
    }
  }

  async function runICloudSync(reason?: string) {
    const previous = preferences.getICloudSyncStatus();
    preferences.setICloudSyncStatus({
      ...previous,
      state: previous.enabled ? 'checking' : previous.state,
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    try {
      const result = await backend.runICloudSync(reason);
      workspace.clearError();
      preferences.setICloudSyncStatus(result);
      return result;
    } catch (error) {
      const message = normalizeErrorMessage(error, 'iCloud 동기화를 실행하지 못했습니다.');
      preferences.setICloudSyncStatus({
        ...previous,
        state: 'error',
        lastErrorCode: 'sync_failed',
        lastErrorMessage: message,
      });
      workspace.setError(message);
      throw new Error(message);
    }
  }

  async function resetICloudSyncCheckpoint() {
    try {
      const result = await backend.resetICloudSyncCheckpoint();
      workspace.clearError();
      preferences.setICloudSyncStatus(result);
      return result;
    } catch (error) {
      const message = normalizeErrorMessage(error, 'iCloud 체크포인트를 초기화하지 못했습니다.');
      workspace.setError(message);
      throw new Error(message);
    }
  }

  async function forceUploadAllDocuments() {
    try {
      const result = await backend.forceUploadAllDocuments();
      workspace.clearError();
      preferences.setICloudSyncStatus(result);
      return result;
    } catch (error) {
      const message = normalizeErrorMessage(error, '로컬 문서를 다시 업로드하지 못했습니다.');
      workspace.setError(message);
      throw new Error(message);
    }
  }

  async function forceRedownloadFromCloud() {
    try {
      const result = await backend.forceRedownloadFromCloud();
      workspace.clearError();
      preferences.setICloudSyncStatus(result);
      return result;
    } catch (error) {
      const message = normalizeErrorMessage(error, 'Cloud 기준으로 다시 받지 못했습니다.');
      workspace.setError(message);
      throw new Error(message);
    }
  }

  return {
    setThemeMode,
    setDefaultBlockTintPreset,
    setDefaultDocumentSurfaceTonePreset,
    setDefaultBlockKind,
    setBodyFontFamily,
    setBodyFontSizePx,
    setCodeFontFamily,
    setCodeFontSizePx,
    setMenuBarIconEnabled,
    setAlwaysOnTopEnabled,
    previewWindowOpacityPercent,
    setWindowOpacityPercent,
    setGlobalToggleShortcut,
    setICloudSyncEnabled,
    runICloudSync,
    resetICloudSyncCheckpoint,
    forceUploadAllDocuments,
    forceRedownloadFromCloud,
  };
}
