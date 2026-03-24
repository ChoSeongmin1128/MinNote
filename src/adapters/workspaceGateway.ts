import type { WorkspaceGateway } from '../application/ports/workspaceGateway';
import { useWorkspaceStore } from '../stores/workspaceStore';

export const workspaceGateway: WorkspaceGateway = {
  setDocuments(documents) {
    useWorkspaceStore.getState().setDocuments(documents);
  },
  setTrashDocuments(documents) {
    useWorkspaceStore.getState().setTrashDocuments(documents);
  },
  upsertDocumentSummary(document) {
    useWorkspaceStore.getState().upsertDocumentSummary(document);
  },
  setSearchResults(results) {
    useWorkspaceStore.getState().setSearchResults(results);
  },
  setSearchQuery(query) {
    useWorkspaceStore.getState().setSearchQuery(query);
  },
  setIsBootstrapping(value) {
    useWorkspaceStore.getState().setIsBootstrapping(value);
  },
  clearError() {
    useWorkspaceStore.getState().setError(null);
  },
  setError(message) {
    useWorkspaceStore.getState().setError(message);
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
  setThemeMode(themeMode) {
    useWorkspaceStore.getState().setThemeMode(themeMode);
  },
  setIcloudSyncEnabled(value) {
    useWorkspaceStore.getState().setIcloudSyncEnabled(value);
  },
  getIcloudSyncStatus() {
    return useWorkspaceStore.getState().icloudSyncStatus;
  },
  setIcloudSyncStatus(status) {
    useWorkspaceStore.getState().setIcloudSyncStatus(status);
  },
  setMenuBarIconEnabled(value) {
    useWorkspaceStore.getState().setMenuBarIconEnabled(value);
  },
  setSettingsOpen(isOpen) {
    useWorkspaceStore.getState().setSettingsOpen(isOpen);
  },
};
