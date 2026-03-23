import { toDocumentSummaryVm, toDocumentVm, toSearchResultVm } from '../adapters/documentAdapter';
import { desktopApi } from '../lib/desktopApi';
import type { BlockKind, BlockTintPreset, ThemeMode } from '../lib/types';
import { clearAllDocumentSync } from '../services/documentSync';
import { enqueueSyncMutation } from '../services/syncBoundary';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  normalizeErrorMessage,
  clearError,
  reportWorkspaceError,
  setCurrentDocument,
} from './controllerSupport';

let searchTimer: number | null = null;
let searchRequestToken = 0;

export async function bootstrapApp() {
  const workspace = useWorkspaceStore.getState();
  workspace.setIsBootstrapping(true);
  workspace.setError(null);

  try {
    const payload = await desktopApi.bootstrapApp();
    workspace.setDocuments(payload.documents.map(toDocumentSummaryVm));
    workspace.setTrashDocuments(payload.trashDocuments.map(toDocumentSummaryVm));
    workspace.setSearchResults([]);
    workspace.setSearchQuery('');
    workspace.setThemeMode(payload.themeMode);
    workspace.setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
    workspace.setIcloudSyncEnabled(payload.icloudSyncEnabled);
    workspace.setMenuBarIconEnabled(payload.menuBarIconEnabled);
    workspace.setDefaultBlockKind(payload.defaultBlockKind);
    setCurrentDocument(payload.currentDocument ? toDocumentVm(payload.currentDocument) : null);
  } catch (error) {
    workspace.setError(normalizeErrorMessage(error, '초기화에 실패했습니다.'));
  } finally {
    workspace.setIsBootstrapping(false);
  }
}

export function setSearchQuery(query: string) {
  const workspace = useWorkspaceStore.getState();
  workspace.setSearchQuery(query);

  if (searchTimer) {
    window.clearTimeout(searchTimer);
    searchTimer = null;
  }

  if (!query.trim()) {
    workspace.setSearchResults([]);
    return;
  }

  const token = ++searchRequestToken;
  searchTimer = window.setTimeout(async () => {
    try {
      const results = await desktopApi.searchDocuments(query);
      if (token !== searchRequestToken) {
        return;
      }
      clearError();
      useWorkspaceStore.getState().setSearchResults(results.map(toSearchResultVm));
    } catch (error) {
      if (token !== searchRequestToken) {
        return;
      }
      reportWorkspaceError(error, '검색 결과를 불러오지 못했습니다.');
    }
  }, 200);
}

export async function setThemeMode(themeMode: ThemeMode) {
  try {
    const nextThemeMode = await desktopApi.setThemeMode(themeMode);
    clearError();
    useWorkspaceStore.getState().setThemeMode(nextThemeMode);
  } catch (error) {
    reportWorkspaceError(error, '테마를 변경하지 못했습니다.');
  }
}

export async function setDefaultBlockTintPreset(preset: BlockTintPreset) {
  try {
    const nextPreset = await desktopApi.setDefaultBlockTintPreset(preset);
    clearError();
    useWorkspaceStore.getState().setDefaultBlockTintPreset(nextPreset);
  } catch (error) {
    reportWorkspaceError(error, '기본 블록 색상쌍을 변경하지 못했습니다.');
  }
}

export async function setIcloudSyncEnabled(enabled: boolean) {
  try {
    const result = await desktopApi.setIcloudSyncEnabled(enabled);
    clearError();
    useWorkspaceStore.getState().setIcloudSyncEnabled(result);
    useWorkspaceStore.getState().setIcloudSyncStatus({
      state: result ? 'idle' : 'disabled',
      lastSyncAt: null,
      errorMessage: null,
    });
  } catch (error) {
    reportWorkspaceError(error, 'iCloud 동기화 설정을 변경하지 못했습니다.');
  }
}

export async function setDefaultBlockKind(kind: BlockKind) {
  try {
    const result = await desktopApi.setDefaultBlockKind(kind);
    useWorkspaceStore.getState().setDefaultBlockKind(result);
  } catch (error) {
    reportWorkspaceError(error, '기본 블록 종류를 변경하지 못했습니다.');
  }
}

export async function setMenuBarIconEnabled(enabled: boolean) {
  try {
    const result = await desktopApi.setMenuBarIconEnabled(enabled);
    useWorkspaceStore.getState().setMenuBarIconEnabled(result);
  } catch (error) {
    reportWorkspaceError(error, '메뉴바 아이콘 설정을 변경하지 못했습니다.');
  }
}

export async function deleteAllDocuments() {
  try {
    const payload = await desktopApi.deleteAllDocuments();
    clearError();
    clearAllDocumentSync();
    useWorkspaceStore.getState().setDocuments(payload.documents.map(toDocumentSummaryVm));
    useWorkspaceStore.getState().setTrashDocuments([]);
    useWorkspaceStore.getState().setThemeMode(payload.themeMode);
    useWorkspaceStore.getState().setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
    useWorkspaceStore.getState().setIcloudSyncEnabled(payload.icloudSyncEnabled);
    useWorkspaceStore.getState().setSettingsOpen(false);
    setCurrentDocument(payload.currentDocument ? toDocumentVm(payload.currentDocument) : null);
    enqueueSyncMutation({ kind: 'documents-reset' });
  } catch (error) {
    reportWorkspaceError(error, '전체 문서를 삭제하지 못했습니다.');
  }
}
