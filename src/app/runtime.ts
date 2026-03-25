import { backendPort } from '../adapters/backendPort';
import { clipboardPort } from '../adapters/clipboardPort';
import { documentSyncPort } from '../adapters/documentSyncPort';
import { historyGateway } from '../adapters/historyGateway';
import { preferencesGateway } from '../adapters/preferencesGateway';
import { schedulerPort } from '../adapters/schedulerPort';
import { sessionGateway } from '../adapters/sessionGateway';
import { syncEventPort } from '../adapters/syncEventPort';
import { syncMutationPort } from '../adapters/syncMutationPort';
import { workspaceGateway } from '../adapters/workspaceGateway';
import { createBlockUseCases } from '../application/usecases/block/blockUseCases';
import { createDocumentUseCases } from '../application/usecases/document/documentUseCases';
import { createPreferencesUseCases } from '../application/usecases/preferences/preferencesUseCases';
import { normalizeErrorMessage } from '../application/usecases/shared/errors';
import { createWorkspaceUseCases } from '../application/usecases/workspace/workspaceUseCases';

const documentUseCases = createDocumentUseCases({
  backend: backendPort,
  documentSync: documentSyncPort,
  history: historyGateway,
  preferences: preferencesGateway,
  session: sessionGateway,
  syncMutation: syncMutationPort,
  workspace: workspaceGateway,
});

const preferencesUseCases = createPreferencesUseCases({
  backend: backendPort,
  preferences: preferencesGateway,
  workspace: workspaceGateway,
});

const workspaceUseCases = createWorkspaceUseCases({
  backend: backendPort,
  documentSync: documentSyncPort,
  preferences: preferencesGateway,
  scheduler: schedulerPort,
  session: sessionGateway,
  syncMutation: syncMutationPort,
  workspace: workspaceGateway,
});

const blockUseCases = createBlockUseCases({
  backend: backendPort,
  clipboard: clipboardPort,
  documentSync: documentSyncPort,
  flushCurrentDocument: documentUseCases.flushCurrentDocument,
  history: historyGateway,
  session: sessionGateway,
  syncMutation: syncMutationPort,
  workspace: workspaceGateway,
});

documentSyncPort.setErrorHandler((error, context) => {
  const fallback =
    context.phase === 'autosave'
      ? '변경 내용을 자동 저장하지 못했습니다.'
      : '변경 내용을 저장하지 못했습니다.';
  workspaceGateway.setError(normalizeErrorMessage(error, fallback));
});

export const appUseCases = {
  ...documentUseCases,
  ...blockUseCases,
  ...preferencesUseCases,
  ...workspaceUseCases,
};

export { syncEventPort };
