import type { SyncEventMessage } from '../../../lib/types';
import type { BackendPort } from '../../ports/backendPort';
import type { DocumentSyncPort } from '../../ports/documentSyncPort';
import type { SchedulerPort } from '../../ports/schedulerPort';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { SyncMutationPort } from '../../ports/syncMutationPort';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { applyBootstrapPayloadState } from '../shared/documentState';
import { normalizeErrorMessage } from '../shared/errors';

interface WorkspaceUseCaseDeps {
  backend: BackendPort;
  documentSync: DocumentSyncPort;
  scheduler: SchedulerPort;
  session: SessionGateway;
  syncMutation: SyncMutationPort;
  workspace: WorkspaceGateway;
}

export function createWorkspaceUseCases({
  backend,
  documentSync,
  scheduler,
  session,
  syncMutation,
  workspace,
}: WorkspaceUseCaseDeps) {
  let searchTimer: number | null = null;
  let searchRequestToken = 0;

  async function bootstrapApp() {
    workspace.setIsBootstrapping(true);
    workspace.setError(null);

    try {
      const payload = await backend.bootstrapApp();
      applyBootstrapPayloadState(workspace, session, payload, 'always');
      workspace.setSearchResults([]);
      workspace.setSearchQuery('');
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '초기화에 실패했습니다.'));
    } finally {
      workspace.setIsBootstrapping(false);
    }
  }

  function setSearchQuery(query: string) {
    workspace.setSearchQuery(query);
    scheduler.clearTimeout(searchTimer);
    searchTimer = null;

    if (!query.trim()) {
      workspace.setSearchResults([]);
      return;
    }

    const token = ++searchRequestToken;
    searchTimer = scheduler.setTimeout(() => {
      void (async () => {
        try {
          const results = await backend.searchDocuments(query);
          if (token !== searchRequestToken) {
            return;
          }
          workspace.clearError();
          workspace.setSearchResults(results);
        } catch (error) {
          if (token !== searchRequestToken) {
            return;
          }
          workspace.setError(normalizeErrorMessage(error, '검색 결과를 불러오지 못했습니다.'));
        }
      })();
    }, 200);
  }

  async function setThemeMode(themeMode: Parameters<BackendPort['setThemeMode']>[0]) {
    try {
      const nextThemeMode = await backend.setThemeMode(themeMode);
      workspace.clearError();
      workspace.setThemeMode(nextThemeMode);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '테마를 변경하지 못했습니다.'));
    }
  }

  async function setDefaultBlockTintPreset(preset: Parameters<BackendPort['setDefaultBlockTintPreset']>[0]) {
    try {
      const nextPreset = await backend.setDefaultBlockTintPreset(preset);
      workspace.clearError();
      workspace.setDefaultBlockTintPreset(nextPreset);
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
      workspace.setDefaultDocumentSurfaceTonePreset(nextPreset);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '기본 문서 배경 톤을 변경하지 못했습니다.'));
    }
  }

  async function setIcloudSyncEnabled(enabled: boolean) {
    try {
      const result = await backend.setIcloudSyncEnabled(enabled);
      workspace.clearError();
      workspace.setIcloudSyncEnabled(result);
      workspace.setIcloudSyncStatus({
        state: result ? 'idle' : 'disabled',
        lastSyncAt: null,
        errorMessage: null,
      });
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, 'iCloud 동기화 설정을 변경하지 못했습니다.'));
    }
  }

  async function setDefaultBlockKind(kind: Parameters<BackendPort['setDefaultBlockKind']>[0]) {
    try {
      const result = await backend.setDefaultBlockKind(kind);
      workspace.clearError();
      workspace.setDefaultBlockKind(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '기본 블록 종류를 변경하지 못했습니다.'));
    }
  }

  async function setMenuBarIconEnabled(enabled: boolean) {
    try {
      const result = await backend.setMenuBarIconEnabled(enabled);
      workspace.clearError();
      workspace.setMenuBarIconEnabled(result);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '메뉴바 아이콘 설정을 변경하지 못했습니다.'));
    }
  }

  async function deleteAllDocuments() {
    try {
      const payload = await backend.deleteAllDocuments();
      workspace.clearError();
      documentSync.clearAllDocumentSync();
      applyBootstrapPayloadState(workspace, session, payload, 'always');
      workspace.setSettingsOpen(false);
      syncMutation.enqueue({ kind: 'documents-reset' });
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '전체 문서를 삭제하지 못했습니다.'));
    }
  }

  async function handleSyncEventMessage(message: SyncEventMessage) {
    if (message.type === 'status') {
      const state = message.state === 'idle'
        ? 'idle'
        : message.state === 'syncing'
          ? 'syncing'
          : 'error';
      workspace.setIcloudSyncStatus({
        state,
        lastSyncAt: message.lastSyncAt ?? null,
        errorMessage: null,
      });
      return;
    }

    if (message.type === 'remote-changed') {
      try {
        const payload = await backend.applyRemoteDocuments(message.documents);
        applyBootstrapPayloadState(workspace, session, payload, 'match-current');
      } catch {
        // 원격 적용 실패는 조용히 무시합니다.
      }
      return;
    }

    workspace.setIcloudSyncStatus({
      state: 'error',
      lastSyncAt: workspace.getIcloudSyncStatus().lastSyncAt,
      errorMessage: message.message,
    });
  }

  return {
    bootstrapApp,
    setSearchQuery,
    setThemeMode,
    setDefaultBlockTintPreset,
    setDefaultDocumentSurfaceTonePreset,
    setIcloudSyncEnabled,
    setDefaultBlockKind,
    setMenuBarIconEnabled,
    deleteAllDocuments,
    handleSyncEventMessage,
  };
}
