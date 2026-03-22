import { create } from 'zustand';
import type { BlockTintPreset, ThemeMode } from '../lib/types';
import type { DocumentSummaryVm, SearchResultVm } from '../adapters/documentAdapter';
import type { CodeLanguageId } from '../lib/blockOptions';

interface WorkspaceState {
  documents: DocumentSummaryVm[];
  searchResults: SearchResultVm[];
  searchQuery: string;
  isBootstrapping: boolean;
  error: string | null;
  defaultBlockTintPreset: BlockTintPreset;
  themeMode: ThemeMode;
  icloudSyncEnabled: boolean;
  isSettingsOpen: boolean;
  isSidebarOpen: boolean;
  lastCodeLanguage: CodeLanguageId;
  setDocuments: (documents: DocumentSummaryVm[]) => void;
  upsertDocumentSummary: (document: DocumentSummaryVm) => void;
  removeDocument: (documentId: string) => void;
  setSearchResults: (results: SearchResultVm[]) => void;
  setSearchQuery: (query: string) => void;
  setIsBootstrapping: (value: boolean) => void;
  setError: (value: string | null) => void;
  setDefaultBlockTintPreset: (preset: BlockTintPreset) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setIcloudSyncEnabled: (value: boolean) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setLastCodeLanguage: (language: CodeLanguageId) => void;
}

function sortDocuments(documents: DocumentSummaryVm[]) {
  return [...documents].sort((left, right) => right.updatedAt - left.updatedAt);
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  documents: [],
  searchResults: [],
  searchQuery: '',
  isBootstrapping: true,
  error: null,
  defaultBlockTintPreset: 'mist',
  themeMode: 'system',
  icloudSyncEnabled: false,
  isSettingsOpen: false,
  isSidebarOpen: false,
  lastCodeLanguage: 'javascript' as CodeLanguageId,
  setDocuments: (documents) => set({ documents: sortDocuments(documents) }),
  upsertDocumentSummary: (document) =>
    set((state) => ({
      documents: sortDocuments([
        document,
        ...state.documents.filter((entry) => entry.id !== document.id),
      ]),
    })),
  removeDocument: (documentId) =>
    set((state) => ({
      documents: state.documents.filter((document) => document.id !== documentId),
      searchResults: state.searchResults.filter((document) => document.id !== documentId),
    })),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsBootstrapping: (isBootstrapping) => set({ isBootstrapping }),
  setError: (error) => set({ error }),
  setDefaultBlockTintPreset: (defaultBlockTintPreset) => set({ defaultBlockTintPreset }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setIcloudSyncEnabled: (icloudSyncEnabled) => set({ icloudSyncEnabled }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setLastCodeLanguage: (lastCodeLanguage) => set({ lastCodeLanguage }),
}));
