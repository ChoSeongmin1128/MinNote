import type { BackendPort } from '../../ports/backendPort';
import type { DocumentSyncPort } from '../../ports/documentSyncPort';
import { summarizeDocument, touchDocument } from '../../models/document';
import type { HistoryGateway } from '../../ports/historyGateway';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { SyncMutationPort } from '../../ports/syncMutationPort';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { applyBootstrapPayloadState, updateDocumentState } from '../shared/documentState';
import { normalizeErrorMessage } from '../shared/errors';

interface DocumentUseCaseDeps {
  backend: BackendPort;
  documentSync: DocumentSyncPort;
  history: HistoryGateway;
  session: SessionGateway;
  syncMutation: SyncMutationPort;
  workspace: WorkspaceGateway;
}

export function createDocumentUseCases({
  backend,
  documentSync,
  history,
  session,
  syncMutation,
  workspace,
}: DocumentUseCaseDeps) {
  async function flushCurrentDocument() {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    session.setIsFlushing(true);
    try {
      const updatedAt = await documentSync.flushDocumentSaves(currentDocument.id);
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
      workspace.setSettingsOpen(false);
      syncMutation.enqueue({ kind: 'document-created', documentId: document.id });
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
      workspace.setSettingsOpen(false);
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
      updateDocumentState(session, workspace, document);
      syncMutation.enqueue({ kind: 'document-renamed', documentId: document.id });
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '문서 제목을 저장하지 못했습니다.'));
    }
  }

  async function deleteDocument(documentId: string) {
    try {
      const payload = await backend.deleteDocument(documentId);
      workspace.clearError();
      documentSync.clearDocumentSync(documentId);
      applyBootstrapPayloadState(workspace, session, payload, 'always');
      workspace.setSettingsOpen(false);
      syncMutation.enqueue({ kind: 'document-deleted', documentId });
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
      applyBootstrapPayloadState(workspace, session, payload, 'if-missing');
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
