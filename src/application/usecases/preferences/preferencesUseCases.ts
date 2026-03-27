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

  async function setMenuBarIconEnabled(enabled: boolean) {
    try {
      const result = await backend.setMenuBarIconEnabled(enabled);
      workspace.clearError();
      preferences.setMenuBarIconEnabled(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '메뉴바 아이콘 설정을 변경하지 못했습니다.'));
    }
  }

  async function setAlwaysOnTopEnabled(enabled: boolean) {
    const previous = preferences.getAlwaysOnTopEnabled();
    preferences.setAlwaysOnTopEnabled(enabled);

    try {
      const result = await backend.setAlwaysOnTopEnabled(enabled);
      workspace.clearError();
      preferences.setAlwaysOnTopEnabled(result);
    } catch (error) {
      preferences.setAlwaysOnTopEnabled(previous);
      workspace.setError(normalizeErrorMessage(error, '항상 위에 고정 설정을 변경하지 못했습니다.'));
      throw error;
    }
  }

  async function previewWindowOpacityPercent(percent: number) {
    try {
      return await backend.previewWindowOpacityPercent(percent);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '창 투명도를 미리보기하지 못했습니다.'));
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
      return result;
    } catch (error) {
      if (requestToken !== opacityRequestToken) {
        return preferences.getWindowOpacityPercent();
      }
      preferences.setWindowOpacityPercent(previous);
      workspace.setError(normalizeErrorMessage(error, '창 투명도를 변경하지 못했습니다.'));
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

  return {
    setThemeMode,
    setDefaultBlockTintPreset,
    setDefaultDocumentSurfaceTonePreset,
    setDefaultBlockKind,
    setMenuBarIconEnabled,
    setAlwaysOnTopEnabled,
    previewWindowOpacityPercent,
    setWindowOpacityPercent,
    setGlobalToggleShortcut,
  };
}
