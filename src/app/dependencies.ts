import { backendPort } from '../adapters/backendPort';
import { clipboardPort } from '../adapters/clipboardPort';
import { createEditorPersistenceAdapter } from '../adapters/editorPersistenceAdapter';
import { historyGateway } from '../adapters/historyGateway';
import { preferencesGateway } from '../adapters/preferencesGateway';
import { schedulerPort } from '../adapters/schedulerPort';
import { sessionGateway } from '../adapters/sessionGateway';
import { uiGateway } from '../adapters/uiGateway';
import { workspaceGateway } from '../adapters/workspaceGateway';
import { createBlockUseCases } from '../application/usecases/block/blockUseCases';
import { createDocumentUseCases } from '../application/usecases/document/documentUseCases';
import { createPreferencesUseCases } from '../application/usecases/preferences/preferencesUseCases';
import { normalizeErrorMessage } from '../application/usecases/shared/errors';
import { createWorkspaceUseCases } from '../application/usecases/workspace/workspaceUseCases';

const editorPersistence = createEditorPersistenceAdapter(backendPort);

const documentUseCases = createDocumentUseCases({
  backend: backendPort,
  editorPersistence,
  history: historyGateway,
  preferences: preferencesGateway,
  session: sessionGateway,
  ui: uiGateway,
  workspace: workspaceGateway,
});

const preferencesUseCases = createPreferencesUseCases({
  backend: backendPort,
  preferences: preferencesGateway,
  workspace: workspaceGateway,
});

const workspaceUseCases = createWorkspaceUseCases({
  backend: backendPort,
  editorPersistence,
  preferences: preferencesGateway,
  scheduler: schedulerPort,
  session: sessionGateway,
  ui: uiGateway,
  workspace: workspaceGateway,
});

const blockUseCases = createBlockUseCases({
  backend: backendPort,
  clipboard: clipboardPort,
  editorPersistence,
  flushCurrentDocument: documentUseCases.flushCurrentDocument,
  history: historyGateway,
  session: sessionGateway,
  workspace: workspaceGateway,
});

editorPersistence.setErrorHandler((error, context) => {
  const fallback =
    context.phase === 'autosave'
      ? '변경 내용을 자동 저장하지 못했습니다.'
      : '변경 내용을 저장하지 못했습니다.';
  workspaceGateway.setError(normalizeErrorMessage(error, fallback));
});

editorPersistence.setLifecycleHandler((context) => {
  const currentDocument = sessionGateway.getCurrentDocument();
  if (!currentDocument || currentDocument.id !== context.documentId) {
    return;
  }

  if (context.status === 'started') {
    sessionGateway.startSaving();
    return;
  }

  if (context.status === 'succeeded') {
    sessionGateway.finishSaving();
    sessionGateway.setSaveError(null);
    sessionGateway.setLastSavedAt(context.savedAt ?? Date.now());
    return;
  }

  sessionGateway.finishSaving();
  const fallback =
    context.phase === 'autosave'
      ? '변경 내용을 자동 저장하지 못했습니다.'
      : '변경 내용을 저장하지 못했습니다.';
  sessionGateway.setSaveError(normalizeErrorMessage(context.error, fallback));
});

export const appControllers = {
  documents: documentUseCases,
  blocks: blockUseCases,
  preferences: preferencesUseCases,
  workspace: workspaceUseCases,
};
