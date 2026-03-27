import type { BackendPort } from '../application/ports/backendPort';
import type {
  EditorPersistenceErrorContext,
  EditorPersistencePort,
  PendingBlockSave,
} from '../application/ports/editorPersistencePort';

const SAVE_DEBOUNCE_MS = 500;

export function createEditorPersistenceAdapter(backend: BackendPort): EditorPersistencePort {
  const pendingByDocument = new Map<string, Map<string, PendingBlockSave>>();
  const timersByBlock = new Map<string, number>();
  let handleError: ((error: unknown, context: EditorPersistenceErrorContext) => void) | null = null;

  function getTimerKey(documentId: string, blockId: string) {
    return `${documentId}:${blockId}`;
  }

  function getDocumentPending(documentId: string) {
    let documentPending = pendingByDocument.get(documentId);
    if (!documentPending) {
      documentPending = new Map<string, PendingBlockSave>();
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
      await backend.updateMarkdownBlock(blockId, pending.content);
    } else if (pending.kind === 'code') {
      await backend.updateCodeBlock(blockId, pending.content, pending.language);
    } else {
      await backend.updateTextBlock(blockId, pending.content);
    }

    const latestDocumentPending = pendingByDocument.get(documentId);
    if (latestDocumentPending?.get(blockId) === pending) {
      latestDocumentPending.delete(blockId);
      if (latestDocumentPending.size === 0) {
        pendingByDocument.delete(documentId);
      }
    }
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

  return {
    queueBlockSave(documentId, blockId, save) {
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
          handleError?.(error, {
            documentId,
            blockId,
            phase: 'autosave',
          });
        }
      }, SAVE_DEBOUNCE_MS);

      timersByBlock.set(timerKey, timer);
    },
    async flushDocument(documentId) {
      clearDocumentTimers(documentId);

      const pending = [...(pendingByDocument.get(documentId)?.keys() ?? [])];
      for (const blockId of pending) {
        try {
          await persistBlockSave(documentId, blockId);
        } catch (error) {
          handleError?.(error, {
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

      return backend.flushDocument(documentId);
    },
    clearDocument(documentId) {
      clearDocumentTimers(documentId);
      pendingByDocument.delete(documentId);
    },
    clearAll() {
      for (const timer of timersByBlock.values()) {
        window.clearTimeout(timer);
      }

      timersByBlock.clear();
      pendingByDocument.clear();
    },
    clearBlock(documentId, blockId) {
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
    },
    setErrorHandler(handler) {
      handleError = handler;
    },
  };
}
