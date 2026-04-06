import type { BackendPort } from '../../ports/backendPort';
import type { EditorPersistencePort } from '../../ports/editorPersistencePort';
import { summarizeDocument, touchDocument } from '../../models/document';
import type { HistoryGateway } from '../../ports/historyGateway';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { UiGateway } from '../../ports/uiGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { applyBootstrapPayloadState, updateDocumentState } from '../shared/documentState';
import { normalizeErrorMessage } from '../shared/errors';

interface DocumentUseCaseDeps {
  backend: BackendPort;
  editorPersistence: EditorPersistencePort;
  history: HistoryGateway;
  preferences: PreferencesGateway;
  session: SessionGateway;
  ui: UiGateway;
  workspace: WorkspaceGateway;
}

export function createDocumentUseCases({
  backend,
  editorPersistence,
  history,
  preferences,
  session,
  ui,
  workspace,
}: DocumentUseCaseDeps) {
  async function flushCurrentDocument() {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    session.setIsFlushing(true);
    try {
      const updatedAt = await editorPersistence.flushDocument(currentDocument.id);
      if (updatedAt !== null) {
        updateDocumentState(
          session,
          workspace,
          touchDocument(currentDocument, updatedAt),
        );
      }
    } finally {
      session.setIsFlushing(false);
    }
  }

  async function createDocument() {
    try {
      const currentDocument = session.getCurrentDocument();
      if (currentDocument) {
        await flushCurrentDocument();
      }

      const document = await backend.createDocument();
      workspace.clearError();
      history.clear();
      workspace.upsertDocumentSummary(summarizeDocument(document));
      session.setCurrentDocument(document);
      session.markStructuralMutation(document.updatedAt);
      ui.setSettingsOpen(false);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서를 만들지 못했습니다.'));
    }
  }

  async function openDocument(documentId: string) {
    try {
      const currentDocument = session.getCurrentDocument();
      if (currentDocument?.id === documentId) {
        return;
      }

      if (currentDocument) {
        await flushCurrentDocument();
      }

      const document = await backend.openDocument(documentId);
      workspace.clearError();
      history.clear();
      workspace.upsertDocumentSummary(summarizeDocument(document));
      session.setCurrentDocument(document);
      ui.setSettingsOpen(false);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서를 열지 못했습니다.'));
    }
  }

  async function commitDocumentTitle(title: string) {
    try {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) {
        return;
      }

      const document = await backend.renameDocument(currentDocument.id, title.trim() ? title : null);
      workspace.clearError();
      session.markStructuralMutation(document.updatedAt);
      updateDocumentState(session, workspace, document);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서 제목을 저장하지 못했습니다.'));
    }
  }

  async function deleteDocument(documentId: string) {
    try {
      const currentDocument = session.getCurrentDocument();
      if (currentDocument) {
        await flushCurrentDocument();
      }

      editorPersistence.clearDocument(documentId);
      const payload = await backend.deleteDocument(documentId);
      workspace.clearError();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'always');
      session.markStructuralMutation();
      ui.setSettingsOpen(false);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서를 삭제하지 못했습니다.'));
    }
  }

  async function emptyTrash() {
    try {
      await backend.emptyTrash();
      workspace.clearError();
      workspace.setTrashDocuments([]);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '휴지통을 비우지 못했습니다.'));
    }
  }

  async function restoreDocumentFromTrash(documentId: string) {
    try {
      const payload = await backend.restoreDocumentFromTrash(documentId);
      workspace.clearError();
      applyBootstrapPayloadState(preferences, workspace, session, payload, 'if-missing');
      session.markStructuralMutation();
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서를 복원하지 못했습니다.'));
    }
  }

  async function setDocumentBlockTintOverride(preset: Parameters<BackendPort['setDocumentBlockTintOverride']>[1]) {
    try {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) {
        return;
      }

      const nextDocument = await backend.setDocumentBlockTintOverride(currentDocument.id, preset);
      workspace.clearError();
      session.markStructuralMutation(nextDocument.updatedAt);
      updateDocumentState(session, workspace, nextDocument);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서 색상쌍을 변경하지 못했습니다.'));
    }
  }

  async function setDocumentSurfaceToneOverride(
    preset: Parameters<BackendPort['setDocumentSurfaceToneOverride']>[1],
  ) {
    try {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) {
        return;
      }

      const nextDocument = await backend.setDocumentSurfaceToneOverride(currentDocument.id, preset);
      workspace.clearError();
      session.markStructuralMutation(nextDocument.updatedAt);
      updateDocumentState(session, workspace, nextDocument);
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서 배경 톤을 변경하지 못했습니다.'));
    }
  }

  return {
    flushCurrentDocument,
    createDocument,
    openDocument,
    commitDocumentTitle,
    deleteDocument,
    emptyTrash,
    restoreDocumentFromTrash,
    setDocumentBlockTintOverride,
    setDocumentSurfaceToneOverride,
  };
}
