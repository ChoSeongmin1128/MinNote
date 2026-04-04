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
  setBodyFontFamily(fontFamily) {
    useWorkspaceStore.getState().setBodyFontFamily(fontFamily);
  },
  setBodyFontSizePx(size) {
    useWorkspaceStore.getState().setBodyFontSizePx(size);
  },
  setCodeFontFamily(fontFamily) {
    useWorkspaceStore.getState().setCodeFontFamily(fontFamily);
  },
  setCodeFontSizePx(size) {
    useWorkspaceStore.getState().setCodeFontSizePx(size);
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
  getMenuBarIconError() {
    return useWorkspaceStore.getState().menuBarIconError;
  },
  setMenuBarIconError(value) {
    useWorkspaceStore.getState().setMenuBarIconError(value);
  },
  getWindowPreferenceError() {
    return useWorkspaceStore.getState().windowPreferenceError;
  },
  setWindowPreferenceError(value) {
    useWorkspaceStore.getState().setWindowPreferenceError(value);
  },
  getICloudSyncStatus() {
    return useWorkspaceStore.getState().icloudSyncStatus;
  },
  setICloudSyncStatus(value) {
    useWorkspaceStore.getState().setICloudSyncStatus(value);
  },
};
