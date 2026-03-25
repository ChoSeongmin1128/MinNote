import type { SyncEventMessage } from '../../../lib/types';
import type { BackendPort } from '../../ports/backendPort';
import type { DocumentSyncPort } from '../../ports/documentSyncPort';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
import type { SchedulerPort } from '../../ports/schedulerPort';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { SyncMutationPort } from '../../ports/syncMutationPort';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { applyBootstrapPayloadState, applyWindowControlRuntimeState } from '../shared/documentState';
import { normalizeErrorMessage } from '../shared/errors';

interface WorkspaceUseCaseDeps {
  backend: BackendPort;
  documentSync: DocumentSyncPort;
  preferences: PreferencesGateway;
  scheduler: SchedulerPort;
  session: SessionGateway;
  syncMutation: SyncMutationPort;
  workspace: WorkspaceGateway;
}

export function createWorkspaceUseCases({
  backend,
  documentSync,
  preferences,
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
      const runtimeState = await backend.getWindowControlRuntimeState();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always');
      applyWindowControlRuntimeState(preferences, runtimeState);
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

  async function deleteAllDocuments() {
    try {
      const payload = await backend.deleteAllDocuments();
      workspace.clearError();
      documentSync.clearAllDocumentSync();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always');
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
      preferences.setIcloudSyncStatus({
        state,
        lastSyncAt: message.lastSyncAt ?? null,
        lastStatusAt: Date.now(),
        errorMessage: null,
      });
      return;
    }

    if (message.type === 'remote-changed') {
      try {
        const payload = await backend.applyRemoteDocuments(message.documents);
        applyBootstrapPayloadState(preferences, workspace, session, payload, 'match-current');
      } catch {
        // 원격 적용 실패는 조용히 무시합니다.
      }
      return;
    }

    preferences.setIcloudSyncStatus({
      state: 'error',
      lastSyncAt: preferences.getIcloudSyncStatus().lastSyncAt,
      lastStatusAt: Date.now(),
      errorMessage: message.message,
    });
  }

  return {
    bootstrapApp,
    setSearchQuery,
    deleteAllDocuments,
    handleSyncEventMessage,
  };
}
