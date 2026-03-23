import { desktopApi } from '../lib/desktopApi';
import { enqueueSyncMutation } from './syncBoundary';

type PendingSave =
  | { kind: 'markdown'; content: string }
  | { kind: 'code'; content: string; language: string | null }
  | { kind: 'text'; content: string };

interface DocumentSyncErrorContext {
  documentId: string;
  blockId: string;
  phase: 'autosave' | 'flush';
}

const SAVE_DEBOUNCE_MS = 500;
const pendingByDocument = new Map<string, Map<string, PendingSave>>();
const timersByBlock = new Map<string, number>();
let handleDocumentSyncError: ((error: unknown, context: DocumentSyncErrorContext) => void) | null = null;

function getTimerKey(documentId: string, blockId: string) {
  return `${documentId}:${blockId}`;
}

function getDocumentPending(documentId: string) {
  let documentPending = pendingByDocument.get(documentId);
  if (!documentPending) {
    documentPending = new Map<string, PendingSave>();
    pendingByDocument.set(documentId, documentPending);
  }

  return documentPending;
}

async function persistBlockSave(documentId: string, blockId: string) {
  const documentPending = pendingByDocument.get(documentId);
  const pending = documentPending?.get(blockId);
  if (!pending) {
    return;
  }

  if (pending.kind === 'markdown') {
    await desktopApi.updateMarkdownBlock(blockId, pending.content);
  } else if (pending.kind === 'code') {
    await desktopApi.updateCodeBlock(blockId, pending.content, pending.language);
  } else {
    await desktopApi.updateTextBlock(blockId, pending.content);
  }

  const latestDocumentPending = pendingByDocument.get(documentId);
  if (latestDocumentPending?.get(blockId) === pending) {
    latestDocumentPending.delete(blockId);
    if (latestDocumentPending.size === 0) {
      pendingByDocument.delete(documentId);
    }
  }

  enqueueSyncMutation({ kind: 'block-updated', documentId, blockId });
}

function clearDocumentTimers(documentId: string) {
  for (const [timerKey, timer] of timersByBlock.entries()) {
    if (!timerKey.startsWith(`${documentId}:`)) {
      continue;
    }
    window.clearTimeout(timer);
    timersByBlock.delete(timerKey);
  }
}

export function queueDocumentSave(documentId: string, blockId: string, save: PendingSave) {
  getDocumentPending(documentId).set(blockId, save);

  const timerKey = getTimerKey(documentId, blockId);
  const existingTimer = timersByBlock.get(timerKey);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const timer = window.setTimeout(async () => {
    timersByBlock.delete(timerKey);
    try {
      await persistBlockSave(documentId, blockId);
    } catch (error) {
      handleDocumentSyncError?.(error, {
        documentId,
        blockId,
        phase: 'autosave',
      });
    }
  }, SAVE_DEBOUNCE_MS);

  timersByBlock.set(timerKey, timer);
}

export async function flushDocumentSaves(documentId: string) {
  clearDocumentTimers(documentId);

  const pending = [...(pendingByDocument.get(documentId)?.keys() ?? [])];
  for (const blockId of pending) {
    try {
      await persistBlockSave(documentId, blockId);
    } catch (error) {
      handleDocumentSyncError?.(error, {
        documentId,
        blockId,
        phase: 'flush',
      });
      throw error;
    }
  }

  if (pending.length === 0) {
    return null;
  }

  return desktopApi.flushDocument(documentId);
}

export function setDocumentSyncErrorHandler(
  handler: ((error: unknown, context: DocumentSyncErrorContext) => void) | null,
) {
  handleDocumentSyncError = handler;
}

export function clearDocumentSync(documentId: string) {
  clearDocumentTimers(documentId);
  pendingByDocument.delete(documentId);
}

export function clearAllDocumentSync() {
  for (const timer of timersByBlock.values()) {
    window.clearTimeout(timer);
  }

  timersByBlock.clear();
  pendingByDocument.clear();
}

export function clearBlockSync(documentId: string, blockId: string) {
  const timerKey = getTimerKey(documentId, blockId);
  const timer = timersByBlock.get(timerKey);
  if (timer) {
    window.clearTimeout(timer);
    timersByBlock.delete(timerKey);
  }

  const documentPending = pendingByDocument.get(documentId);
  if (!documentPending) {
    return;
  }

  documentPending.delete(blockId);
  if (documentPending.size === 0) {
    pendingByDocument.delete(documentId);
  }
}
