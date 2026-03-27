import type { BackendPort } from '../../ports/backendPort';
import type { EditorPersistencePort } from '../../ports/editorPersistencePort';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
import type { SchedulerPort } from '../../ports/schedulerPort';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { UiGateway } from '../../ports/uiGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { applyBootstrapPayloadState, applyWindowControlRuntimeState } from '../shared/documentState';
import { normalizeErrorMessage } from '../shared/errors';

interface WorkspaceUseCaseDeps {
  backend: BackendPort;
  editorPersistence: EditorPersistencePort;
  preferences: PreferencesGateway;
  scheduler: SchedulerPort;
  session: SessionGateway;
  ui: UiGateway;
  workspace: WorkspaceGateway;
}

export function createWorkspaceUseCases({
  backend,
  editorPersistence,
  preferences,
  scheduler,
  session,
  ui,
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
      editorPersistence.clearAll();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always');
      ui.setSettingsOpen(false);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '전체 문서를 삭제하지 못했습니다.'));
    }
  }

  return {
    bootstrapApp,
    setSearchQuery,
    deleteAllDocuments,
    confirmAppShutdown: backend.confirmAppShutdown,
  };
}
