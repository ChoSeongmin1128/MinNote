import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AppUpdateStatus,
  BlockKind,
  BlockTintPreset,
  DocumentSurfaceTonePreset,
  ICloudSyncStatus,
  ThemeMode,
} from '../lib/types';
import type { DocumentSummaryVm, SearchResultVm } from '../application/models/document';
import type { CodeLanguageId } from '../lib/codeLanguageRegistry';

interface WorkspaceState {
  documents: DocumentSummaryVm[];
  trashDocuments: DocumentSummaryVm[];
  searchResults: SearchResultVm[];
  searchQuery: string;
  isBootstrapping: boolean;
  error: string | null;
  defaultBlockTintPreset: BlockTintPreset;
  defaultDocumentSurfaceTonePreset: DocumentSurfaceTonePreset;
  defaultBlockKind: BlockKind;
  themeMode: ThemeMode;
  icloudSyncEnabled: boolean;
  icloudSyncStatus: ICloudSyncStatus;
  appUpdateStatus: AppUpdateStatus;
  menuBarIconEnabled: boolean;
  alwaysOnTopEnabled: boolean;
  windowOpacityPercent: number;
  globalToggleShortcut: string | null;
  globalShortcutError: string | null;
  isSettingsOpen: boolean;
  desktopSidebarExpanded: boolean;
  mobileSidebarOpen: boolean;
  lastCodeLanguage: CodeLanguageId;
  setDocuments: (documents: DocumentSummaryVm[]) => void;
  setTrashDocuments: (documents: DocumentSummaryVm[]) => void;
  upsertDocumentSummary: (document: DocumentSummaryVm) => void;
  removeDocument: (documentId: string) => void;
  setSearchResults: (results: SearchResultVm[]) => void;
  setSearchQuery: (query: string) => void;
  setIsBootstrapping: (value: boolean) => void;
  setError: (value: string | null) => void;
  setDefaultBlockTintPreset: (preset: BlockTintPreset) => void;
  setDefaultDocumentSurfaceTonePreset: (preset: DocumentSurfaceTonePreset) => void;
  setDefaultBlockKind: (kind: BlockKind) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setIcloudSyncEnabled: (value: boolean) => void;
  setIcloudSyncStatus: (status: ICloudSyncStatus) => void;
  setAppUpdateStatus: (status: AppUpdateStatus) => void;
  setMenuBarIconEnabled: (value: boolean) => void;
  setAlwaysOnTopEnabled: (value: boolean) => void;
  setWindowOpacityPercent: (value: number) => void;
  setGlobalToggleShortcut: (value: string | null) => void;
  setGlobalShortcutError: (value: string | null) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setDesktopSidebarExpanded: (isExpanded: boolean) => void;
  setMobileSidebarOpen: (isOpen: boolean) => void;
  setLastCodeLanguage: (language: CodeLanguageId) => void;
}

function sortDocuments(documents: DocumentSummaryVm[]) {
  return [...documents].sort((left, right) => right.updatedAt - left.updatedAt);
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist((set) => ({
  documents: [],
  trashDocuments: [],
  searchResults: [],
  searchQuery: '',
  isBootstrapping: true,
  error: null,
  defaultBlockTintPreset: 'mist',
  defaultDocumentSurfaceTonePreset: 'default',
  defaultBlockKind: 'markdown' as BlockKind,
  themeMode: 'system',
  icloudSyncEnabled: false,
  icloudSyncStatus: { state: 'disabled', lastSyncAt: null, lastStatusAt: null, errorMessage: null },
  appUpdateStatus: { state: 'idle', version: null, percent: null, message: null, lastCheckedAt: null },
  menuBarIconEnabled: false,
  alwaysOnTopEnabled: false,
  windowOpacityPercent: 100,
  globalToggleShortcut: 'Option+M',
  globalShortcutError: null,
  isSettingsOpen: false,
  desktopSidebarExpanded: true,
  mobileSidebarOpen: false,
  lastCodeLanguage: 'javascript' as CodeLanguageId,
  setDocuments: (documents) => set({ documents: sortDocuments(documents) }),
  setTrashDocuments: (trashDocuments) => set({ trashDocuments }),
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
  setDefaultDocumentSurfaceTonePreset: (defaultDocumentSurfaceTonePreset) => set({ defaultDocumentSurfaceTonePreset }),
  setDefaultBlockKind: (defaultBlockKind) => set({ defaultBlockKind }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setIcloudSyncEnabled: (icloudSyncEnabled) => set({ icloudSyncEnabled }),
  setIcloudSyncStatus: (icloudSyncStatus) => set({ icloudSyncStatus }),
  setAppUpdateStatus: (appUpdateStatus) => set({ appUpdateStatus }),
  setMenuBarIconEnabled: (menuBarIconEnabled) => set({ menuBarIconEnabled }),
  setAlwaysOnTopEnabled: (alwaysOnTopEnabled) => set({ alwaysOnTopEnabled }),
  setWindowOpacityPercent: (windowOpacityPercent) => set({ windowOpacityPercent }),
  setGlobalToggleShortcut: (globalToggleShortcut) => set({ globalToggleShortcut }),
  setGlobalShortcutError: (globalShortcutError) => set({ globalShortcutError }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setDesktopSidebarExpanded: (desktopSidebarExpanded) => set({ desktopSidebarExpanded }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setLastCodeLanguage: (lastCodeLanguage) => set({ lastCodeLanguage }),
}), {
    name: 'workspace-ui',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      desktopSidebarExpanded: state.desktopSidebarExpanded,
    }),
  }),
);
