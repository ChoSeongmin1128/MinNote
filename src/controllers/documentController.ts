import {
  summarizeDocument,
  toDocumentSummaryVm,
  toDocumentVm,
  touchDocument,
} from '../adapters/documentAdapter';
import { desktopApi } from '../lib/desktopApi';
import type { BlockTintPreset } from '../lib/types';
import { clearDocumentSync, flushDocumentSaves } from '../services/documentSync';
import { enqueueSyncMutation } from '../services/syncBoundary';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  clearError,
  getCurrentDocument,
  reportWorkspaceError,
  setCurrentDocument,
  updateTouchedDocument,
} from './controllerSupport';
import { useBlockHistoryStore } from '../stores/blockHistoryStore';

export async function flushCurrentDocument() {
  const currentDocument = getCurrentDocument();
  if (!currentDocument) {
    return;
  }

  useDocumentSessionStore.getState().setIsFlushing(true);
  try {
    const updatedAt = await flushDocumentSaves(currentDocument.id);
    updateTouchedDocument(touchDocument(currentDocument, updatedAt));
  } finally {
    useDocumentSessionStore.getState().setIsFlushing(false);
  }
}

export async function createDocument() {
  try {
    const currentDocument = getCurrentDocument();
    if (currentDocument) {
      await flushCurrentDocument();
    }

    const document = toDocumentVm(await desktopApi.createDocument());
    clearError();
    useBlockHistoryStore.getState().clear();
    useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(document));
    setCurrentDocument(document);
    useWorkspaceStore.getState().setSettingsOpen(false);
    enqueueSyncMutation({ kind: 'document-created', documentId: document.id });
  } catch (error) {
    reportWorkspaceError(error, '문서를 만들지 못했습니다.');
  }
}

export async function openDocument(documentId: string) {
  try {
    const currentDocument = getCurrentDocument();
    if (currentDocument?.id === documentId) {
      return;
    }

    if (currentDocument) {
      await flushCurrentDocument();
    }

    const document = toDocumentVm(await desktopApi.openDocument(documentId));
    clearError();
    useBlockHistoryStore.getState().clear();
    useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(document));
    setCurrentDocument(document);
    useWorkspaceStore.getState().setSettingsOpen(false);
  } catch (error) {
    reportWorkspaceError(error, '문서를 열지 못했습니다.');
  }
}

export async function commitDocumentTitle(title: string) {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    const document = toDocumentVm(
      await desktopApi.renameDocument(currentDocument.id, title.trim() ? title : null),
    );
    clearError();
    updateTouchedDocument(document);
    enqueueSyncMutation({ kind: 'document-renamed', documentId: document.id });
  } catch (error) {
    reportWorkspaceError(error, '문서 제목을 저장하지 못했습니다.');
  }
}

export async function deleteDocument(documentId: string) {
  try {
    const payload = await desktopApi.deleteDocument(documentId);
    clearError();
    useWorkspaceStore.getState().setDocuments(payload.documents.map(toDocumentSummaryVm));
    useWorkspaceStore.getState().setTrashDocuments(payload.trashDocuments.map(toDocumentSummaryVm));
    useWorkspaceStore.getState().setThemeMode(payload.themeMode);
    useWorkspaceStore.getState().setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
    useWorkspaceStore.getState().setIcloudSyncEnabled(payload.icloudSyncEnabled);
    useWorkspaceStore.getState().setSettingsOpen(false);
    clearDocumentSync(documentId);
    setCurrentDocument(payload.currentDocument ? toDocumentVm(payload.currentDocument) : null);
    enqueueSyncMutation({ kind: 'document-deleted', documentId });
  } catch (error) {
    reportWorkspaceError(error, '문서를 삭제하지 못했습니다.');
  }
}

export async function emptyTrash() {
  try {
    await desktopApi.emptyTrash();
    clearError();
    useWorkspaceStore.getState().setTrashDocuments([]);
  } catch (error) {
    reportWorkspaceError(error, '휴지통을 비우지 못했습니다.');
  }
}

export async function restoreDocumentFromTrash(documentId: string) {
  try {
    const payload = await desktopApi.restoreDocumentFromTrash(documentId);
    clearError();
    useWorkspaceStore.getState().setDocuments(payload.documents.map(toDocumentSummaryVm));
    useWorkspaceStore.getState().setTrashDocuments(payload.trashDocuments.map(toDocumentSummaryVm));
    useWorkspaceStore.getState().setThemeMode(payload.themeMode);
    useWorkspaceStore.getState().setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
    useWorkspaceStore.getState().setIcloudSyncEnabled(payload.icloudSyncEnabled);
    const current = getCurrentDocument();
    if (!current) {
      setCurrentDocument(payload.currentDocument ? toDocumentVm(payload.currentDocument) : null);
    }
  } catch (error) {
    reportWorkspaceError(error, '문서를 복원하지 못했습니다.');
  }
}

export async function setDocumentBlockTintOverride(preset: BlockTintPreset | null) {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    const nextDocument = toDocumentVm(
      await desktopApi.setDocumentBlockTintOverride(currentDocument.id, preset),
    );
    clearError();
    updateTouchedDocument(nextDocument);
  } catch (error) {
    reportWorkspaceError(error, '문서 색상쌍을 변경하지 못했습니다.');
  }
}
