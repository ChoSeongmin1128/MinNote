import type { BackendPort } from '../../ports/backendPort';
import type { EditorPersistencePort } from '../../ports/editorPersistencePort';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
import type { SchedulerPort } from '../../ports/schedulerPort';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { UiGateway } from '../../ports/uiGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import type { WorkspaceDocumentsChangedEvent } from '../../../lib/types';
import { applyBootstrapPayloadState, updateDocumentState } from '../shared/documentState';
import { normalizeBootstrapErrorMessage, normalizeErrorMessage } from '../shared/errors';

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
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always');
      workspace.setSearchResults([]);
      workspace.setSearchQuery('');
    } catch (error) {
      workspace.setError(normalizeBootstrapErrorMessage(error, '초기화에 실패했습니다.'));
    } finally {
      workspace.setIsBootstrapping(false);
    }
  }

  async function refreshWorkspaceDocumentsAfterSync(event: WorkspaceDocumentsChangedEvent) {
    if (!event.documentsChanged && !event.trashChanged) {
      return;
    }

    try {
      const [documents, trashDocuments] = await Promise.all([
        backend.listDocuments(),
        backend.listTrashDocuments(),
      ]);

      workspace.setDocuments(documents);
      workspace.setTrashDocuments(trashDocuments);
      workspace.clearError();

      const currentDocument = session.getCurrentDocument();
      if (!currentDocument || !event.affectedDocumentIds.includes(currentDocument.id)) {
        workspace.setSyncNotice(null);
        return;
      }

      if (session.hasUnsavedLocalChanges()) {
        workspace.setSyncNotice('다른 기기 변경이 있습니다. 저장 후 다시 반영됩니다.');
        return;
      }

      const currentStillActive = documents.some((document) => document.id === currentDocument.id);
      if (currentStillActive) {
        const nextDocument = await backend.openDocument(currentDocument.id);
        updateDocumentState(session, workspace, nextDocument);
        workspace.setSyncNotice(null);
        return;
      }

      const nextActiveDocument = documents[0] ?? null;
      if (!nextActiveDocument) {
        session.setCurrentDocument(null);
        workspace.setSyncNotice(null);
        return;
      }

      const nextDocument = await backend.openDocument(nextActiveDocument.id);
      session.setCurrentDocument(nextDocument);
      workspace.setSyncNotice(null);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '동기화된 문서 목록을 반영하지 못했습니다.'));
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
    refreshWorkspaceDocumentsAfterSync,
    setSearchQuery,
    deleteAllDocuments,
    confirmAppShutdown: backend.confirmAppShutdown,
  };
}
