import type { BlockCaretPlacement } from '../../../lib/types';
import type { DocumentVm } from '../../models/document';
import type { WorkspaceBootstrapState } from '../../models/workspace';
import { summarizeDocument } from '../../models/document';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';

export type CurrentDocumentStrategy = 'always' | 'if-missing' | 'match-current';

export function findBlock(document: DocumentVm, blockId: string) {
  return document.blocks.find((block) => block.id === blockId) ?? null;
}

export function updateDocumentState(
  session: SessionGateway,
  workspace: WorkspaceGateway,
  document: DocumentVm,
) {
  session.setCurrentDocumentState(document);
  workspace.upsertDocumentSummary(summarizeDocument(document));
}

export function setDocumentWithFocus(
  session: SessionGateway,
  workspace: WorkspaceGateway,
  document: DocumentVm,
  focusBlockId: string | null,
  caret: BlockCaretPlacement = 'start',
) {
  session.setDocumentWithFocus(document, focusBlockId, caret);
  workspace.upsertDocumentSummary(summarizeDocument(document));
}

export function applyBootstrapPayloadState(
  workspace: WorkspaceGateway,
  session: SessionGateway,
  payload: WorkspaceBootstrapState,
  currentDocumentStrategy: CurrentDocumentStrategy = 'always',
) {
  workspace.setDocuments(payload.documents);
  workspace.setTrashDocuments(payload.trashDocuments);
  workspace.setThemeMode(payload.themeMode);
  workspace.setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
  workspace.setDefaultDocumentSurfaceTonePreset(payload.defaultDocumentSurfaceTonePreset);
  workspace.setDefaultBlockKind(payload.defaultBlockKind);
  workspace.setIcloudSyncEnabled(payload.icloudSyncEnabled);
  workspace.setMenuBarIconEnabled(payload.menuBarIconEnabled);

  const nextDocument = payload.currentDocument;
  if (currentDocumentStrategy === 'always') {
    session.setCurrentDocument(nextDocument);
    return;
  }

  if (currentDocumentStrategy === 'if-missing') {
    if (!session.getCurrentDocument()) {
      session.setCurrentDocument(nextDocument);
    }
    return;
  }

  const currentDocument = session.getCurrentDocument();

  if (!currentDocument) {
    session.setCurrentDocument(nextDocument);
    return;
  }

  if (nextDocument && currentDocument.id === nextDocument.id) {
    session.setCurrentDocument(nextDocument);
    return;
  }

  const currentStillExists = payload.documents.some((doc) => doc.id === currentDocument.id);
  if (!currentStillExists) {
    session.setCurrentDocument(nextDocument);
  }
}
