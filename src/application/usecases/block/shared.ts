import type { PendingBlockSave } from '../../ports/editorPersistencePort';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { findBlock, updateDocumentState } from '../shared/documentState';
import type { BlockVm } from '../../models/document';
import type { BlockKind } from '../../../lib/types';

export function findEditableBlock<K extends BlockKind>(
  session: SessionGateway,
  blockId: string,
  kind: K,
): { documentId: string; block: Extract<BlockVm, { kind: K }> } | null {
  const currentDocument = session.getCurrentDocument();
  if (!currentDocument) return null;

  const block = findBlock(currentDocument, blockId);
  if (!block || block.kind !== kind) return null;

  return { documentId: currentDocument.id, block: block as Extract<BlockVm, { kind: K }> };
}

export function applyUpdatedBlock(
  session: SessionGateway,
  workspace: WorkspaceGateway,
  block: BlockVm,
) {
  const currentDocument = session.getCurrentDocument();
  if (!currentDocument) return;

  updateDocumentState(session, workspace, {
    ...currentDocument,
    blocks: currentDocument.blocks
      .map((entry) => (entry.id === block.id ? block : entry))
      .sort((left, right) => left.position - right.position),
  }, { persisted: false });
}

export function queueAndApplyBlockUpdate(
  session: SessionGateway,
  workspace: WorkspaceGateway,
  queueBlockSave: (documentId: string, blockId: string, payload: PendingBlockSave) => void,
  blockId: string,
  nextBlock: BlockVm,
  payload: PendingBlockSave,
) {
  session.markLocalMutation(nextBlock.updatedAt);
  queueBlockSave(nextBlock.documentId, blockId, payload);
  applyUpdatedBlock(session, workspace, nextBlock);
}

export function getSelectedBlocks(
  session: SessionGateway,
  document = session.getCurrentDocument(),
) {
  if (!document) {
    return [];
  }

  const selection = session.getSelectionState();
  if (selection.allBlocksSelected) {
    return document.blocks;
  }

  if (selection.selectedBlockIds.length > 0) {
    const selectedIds = new Set(selection.selectedBlockIds);
    return document.blocks.filter((block) => selectedIds.has(block.id));
  }

  if (selection.blockSelected && selection.selectedBlockId) {
    const block = findBlock(document, selection.selectedBlockId);
    return block ? [block] : [];
  }

  return [];
}

export function getSelectionInsertAfterBlockId(
  session: SessionGateway,
  document: NonNullable<ReturnType<SessionGateway['getCurrentDocument']>>,
) {
  const selection = session.getSelectionState();
  if (selection.allBlocksSelected) {
    return document.blocks.at(-1)?.id ?? null;
  }

  if (selection.selectedBlockIds.length > 0) {
    return selection.selectedBlockIds.at(-1) ?? document.blocks.at(-1)?.id ?? null;
  }

  return selection.selectedBlockId ?? document.blocks.at(-1)?.id ?? null;
}
