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

  function debugIcloud(message: string, payload?: unknown) {
    if (!import.meta.env.DEV) {
      return;
    }

    if (payload === undefined) {
      console.info(`[icloud] ${message}`);
      return;
    }

    console.info(`[icloud] ${message}`, payload);
  }

  async function bootstrapApp() {
    workspace.setIsBootstrapping(true);
    workspace.setError(null);

    try {
      const payload = await backend.bootstrapApp();
      const runtimeState = await backend.getWindowControlRuntimeState();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always', 'reset');
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
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always', 'preserve');
      workspace.setSettingsOpen(false);
      syncMutation.enqueue({ kind: 'documents-reset' });
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '전체 문서를 삭제하지 못했습니다.'));
    }
  }

  async function handleSyncEventMessage(message: SyncEventMessage) {
    debugIcloud('handle-event', message);
    if (message.type === 'status') {
      const state = message.state === 'idle'
        ? 'idle'
        : message.state === 'syncing'
          ? 'syncing'
          : 'error';
      const current = preferences.getIcloudSyncStatus();
      preferences.setIcloudSyncStatus({
        state,
        lastSyncAt: message.lastSyncAt ?? current.lastSyncAt,
        lastStatusAt: Date.now(),
        lastFetchAt: message.lastFetchAt ?? current.lastFetchAt,
        lastSendAt: message.lastSendAt ?? current.lastSendAt,
        initialFetchCompleted: message.initialFetchCompleted,
        errorMessage: null,
      });
      debugIcloud('status:applied', {
        state,
        lastSyncAt: message.lastSyncAt ?? current.lastSyncAt,
        lastFetchAt: message.lastFetchAt ?? current.lastFetchAt,
        lastSendAt: message.lastSendAt ?? current.lastSendAt,
        initialFetchCompleted: message.initialFetchCompleted,
      });
      return;
    }

    if (message.type === 'remote-changed') {
      try {
        debugIcloud('remote-changed:apply:start', { documents: message.documents.length });
        const payload = await backend.applyRemoteDocuments(message.documents);
        applyBootstrapPayloadState(preferences, workspace, session, payload, 'match-current', 'preserve');
        debugIcloud('remote-changed:apply:done', { documents: message.documents.length });
      } catch (error) {
        const current = preferences.getIcloudSyncStatus();
        const errorMessage = normalizeErrorMessage(error, '원격 문서를 반영하지 못했습니다.');
        preferences.setIcloudSyncStatus({
          state: 'error',
          lastSyncAt: current.lastSyncAt,
          lastStatusAt: Date.now(),
          lastFetchAt: current.lastFetchAt,
          lastSendAt: current.lastSendAt,
          initialFetchCompleted: current.initialFetchCompleted,
          errorMessage,
        });
        debugIcloud('remote-changed:apply:error', { message: errorMessage });
      }
      return;
    }

    const current = preferences.getIcloudSyncStatus();
    preferences.setIcloudSyncStatus({
      state: 'error',
      lastSyncAt: current.lastSyncAt,
      lastStatusAt: Date.now(),
      lastFetchAt: current.lastFetchAt,
      lastSendAt: current.lastSendAt,
      initialFetchCompleted: current.initialFetchCompleted,
      errorMessage: message.message,
    });
  }

  return {
    bootstrapApp,
    setSearchQuery,
    deleteAllDocuments,
    handleSyncEventMessage,
    confirmAppShutdown: backend.confirmAppShutdown,
  };
}
