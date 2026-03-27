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
};
