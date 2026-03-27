import type { PreferencesGateway } from '../application/ports/preferencesGateway';
import { useWorkspaceStore } from '../stores/workspaceStore';

export const preferencesGateway: PreferencesGateway = {
  setThemeMode(themeMode) {
    useWorkspaceStore.getState().setThemeMode(themeMode);
  },
  setDefaultBlockTintPreset(preset) {
    useWorkspaceStore.getState().setDefaultBlockTintPreset(preset);
  },
  setDefaultDocumentSurfaceTonePreset(preset) {
    useWorkspaceStore.getState().setDefaultDocumentSurfaceTonePreset(preset);
  },
  setDefaultBlockKind(kind) {
    useWorkspaceStore.getState().setDefaultBlockKind(kind);
  },
  setMenuBarIconEnabled(value) {
    useWorkspaceStore.getState().setMenuBarIconEnabled(value);
  },
  getAlwaysOnTopEnabled() {
    return useWorkspaceStore.getState().alwaysOnTopEnabled;
  },
  setAlwaysOnTopEnabled(value) {
    useWorkspaceStore.getState().setAlwaysOnTopEnabled(value);
  },
  getWindowOpacityPercent() {
    return useWorkspaceStore.getState().windowOpacityPercent;
  },
  setWindowOpacityPercent(value) {
    useWorkspaceStore.getState().setWindowOpacityPercent(value);
  },
  getGlobalToggleShortcut() {
    return useWorkspaceStore.getState().globalToggleShortcut;
  },
  setGlobalToggleShortcut(value) {
    useWorkspaceStore.getState().setGlobalToggleShortcut(value);
  },
  getGlobalShortcutError() {
    return useWorkspaceStore.getState().globalShortcutError;
  },
  setGlobalShortcutError(value) {
    useWorkspaceStore.getState().setGlobalShortcutError(value);
  },
};
