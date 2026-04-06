import type { BlockUseCaseDeps } from './types';
import type { BlockVm } from '../../models/document';
import { executeWithErrorHandling } from '../shared/errors';
import { updateDocumentState } from '../shared/documentState';

function toRestoreBlocks(blocks: BlockVm[]) {
  return blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    content: block.content,
    language: block.kind === 'code' ? block.language : null,
    position: block.position,
  }));
}

export function createBlockHistoryActions({
  backend,
  editorPersistence,
  history,
  session,
  workspace,
}: Pick<BlockUseCaseDeps, 'backend' | 'editorPersistence' | 'history' | 'session' | 'workspace'>) {
  async function undoBlockOperation() {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return;

    const previousDocument = history.popUndo();
    if (!previousDocument) return;

    await executeWithErrorHandling(async () => {
      history.pushRedo(currentDocument);
      await editorPersistence.flushDocument(currentDocument.id);
      const restored = await backend.restoreDocumentBlocks(
        currentDocument.id,
        toRestoreBlocks(previousDocument.blocks),
      );
      workspace.clearError();
      session.markStructuralMutation(restored.updatedAt);
      updateDocumentState(session, workspace, restored);
      session.clearBlockSelection(true);
      const focusId = restored.blocks[0]?.id ?? null;
      if (focusId) {
        session.requestBlockFocus(focusId, 'start');
      }
    }, (message) => workspace.setError(message), '되돌리기에 실패했습니다.');
  }

  async function redoBlockOperation() {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return;

    const nextDocument = history.popRedo();
    if (!nextDocument) return;

    await executeWithErrorHandling(async () => {
      history.pushUndo(currentDocument);
      await editorPersistence.flushDocument(currentDocument.id);
      const restored = await backend.restoreDocumentBlocks(
        currentDocument.id,
        toRestoreBlocks(nextDocument.blocks),
      );
      workspace.clearError();
      session.markStructuralMutation(restored.updatedAt);
      updateDocumentState(session, workspace, restored);
      session.clearBlockSelection(true);
      const focusId = restored.blocks[0]?.id ?? null;
      if (focusId) {
        session.requestBlockFocus(focusId, 'start');
      }
    }, (message) => workspace.setError(message), '다시 실행에 실패했습니다.');
  }

  return {
    undoBlockOperation,
    redoBlockOperation,
  };
}
