import type { BlockCaretPlacement } from '../../../lib/types';
import type { DocumentVm } from '../../models/document';
import type { WindowControlRuntimeState, WorkspaceBootstrapState } from '../../models/workspace';
import { summarizeDocument } from '../../models/document';
import type { PreferencesGateway } from '../../ports/preferencesGateway';
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
  preferences: PreferencesGateway,
  workspace: WorkspaceGateway,
  session: SessionGateway,
  payload: WorkspaceBootstrapState,
  currentDocumentStrategy: CurrentDocumentStrategy = 'always',
) {
  workspace.setDocuments(payload.documents);
  workspace.setTrashDocuments(payload.trashDocuments);
  preferences.setThemeMode(payload.themeMode);
  preferences.setDefaultBlockTintPreset(payload.defaultBlockTintPreset);
  preferences.setDefaultDocumentSurfaceTonePreset(payload.defaultDocumentSurfaceTonePreset);
  preferences.setDefaultBlockKind(payload.defaultBlockKind);
  preferences.setBodyFontFamily(payload.bodyFontFamily);
  preferences.setBodyFontSizePx(payload.bodyFontSizePx);
  preferences.setCodeFontFamily(payload.codeFontFamily);
  preferences.setCodeFontSizePx(payload.codeFontSizePx);
  preferences.setMenuBarIconEnabled(payload.menuBarIconEnabled);
  preferences.setAlwaysOnTopEnabled(payload.alwaysOnTopEnabled);
  preferences.setWindowOpacityPercent(payload.windowOpacityPercent);
  preferences.setGlobalToggleShortcut(payload.globalToggleShortcut);
  preferences.setGlobalShortcutError(payload.globalShortcutError);
  preferences.setMenuBarIconError(payload.menuBarIconError);
  preferences.setWindowPreferenceError(payload.windowPreferenceError);
  preferences.setICloudSyncStatus(payload.icloudSyncStatus);

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

export function applyWindowControlRuntimeState(
  preferences: PreferencesGateway,
  payload: WindowControlRuntimeState,
) {
  preferences.setGlobalShortcutError(payload.globalShortcutError);
  preferences.setMenuBarIconError(payload.menuBarIconError);
  preferences.setWindowPreferenceError(payload.windowPreferenceError);
}
