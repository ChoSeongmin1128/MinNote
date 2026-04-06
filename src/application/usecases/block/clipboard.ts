import { findBlock, updateDocumentState } from '../shared/documentState';
import { executeWithErrorHandling, normalizeErrorMessage } from '../shared/errors';
import type { ClipboardBlockData } from '../../../lib/blockClipboardCodec';
import { isBlockClipboardText, parseBlockClipboardText } from '../../../lib/blockClipboardCodec';
import { isMarkdownContentEmpty } from '../../../lib/markdown';
import type { BlockVm } from '../../models/document';
import { getSelectedBlocks, getSelectionInsertAfterBlockId } from './shared';
import type { BlockUseCaseDeps } from './types';

function toClipboardBlocks(blocks: BlockVm[]): ClipboardBlockData[] {
  return blocks.map((block) => ({
    kind: block.kind,
    content: block.content,
    language: block.kind === 'code' ? block.language : null,
  }));
}

async function writeBlockContent(
  backend: BlockUseCaseDeps['backend'],
  blockId: string,
  data: ClipboardBlockData,
) {
  if (data.kind === 'markdown') {
    await backend.updateMarkdownBlock(blockId, data.content);
    return;
  }

  if (data.kind === 'text') {
    await backend.updateTextBlock(blockId, data.content);
    return;
  }

  await backend.updateCodeBlock(blockId, data.content, data.language ?? null);
}

export function createBlockClipboardActions({
  backend,
  clipboard,
  editorPersistence,
  flushCurrentDocument,
  history,
  session,
  workspace,
}: Pick<BlockUseCaseDeps, 'backend' | 'clipboard' | 'editorPersistence' | 'flushCurrentDocument' | 'history' | 'session' | 'workspace'>, {
  clearBlockContent,
}: {
  clearBlockContent: (block: BlockVm) => Promise<void>;
}) {
  async function copySelectedBlocks() {
    const blocks = getSelectedBlocks(session);
    if (blocks.length === 0) {
      return;
    }

    await clipboard.writeBlocks(toClipboardBlocks(blocks));
  }

  async function copySingleBlock(blockId: string) {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return;

    const block = findBlock(currentDocument, blockId);
    if (!block) return;

    await clipboard.writeBlocks(toClipboardBlocks([block]));
  }

  async function pasteBlocks(clipboardText?: string) {
    const snapshotDocument = session.getCurrentDocument();
    if (snapshotDocument) {
      history.pushUndo(snapshotDocument);
    }

    await executeWithErrorHandling(async () => {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) return;

      const blocksToInsert = clipboardText != null
        ? parseBlockClipboardText(clipboardText)
        : await clipboard.readBlocks();
      if (!blocksToInsert) return;

      const selection = session.getSelectionState();
      const selectedBlock = selection.selectedBlockId
        ? findBlock(currentDocument, selection.selectedBlockId)
        : null;
      const hasSubsetSelection = selection.selectedBlockIds.length > 0;
      const canOverwriteSelectedBlock =
        !selection.allBlocksSelected
        && !hasSubsetSelection
        && selection.blockSelected
        && selectedBlock != null;
      const isSelectedEmpty = selectedBlock
        ? (selectedBlock.kind === 'code'
          ? !selectedBlock.content.trim()
          : isMarkdownContentEmpty(selectedBlock.content))
        : false;

      await flushCurrentDocument();
      let afterBlockId = getSelectionInsertAfterBlockId(session, currentDocument);
      let firstNewBlockId: string | null = null;

      const firstData = blocksToInsert[0];
      if (canOverwriteSelectedBlock && isSelectedEmpty && selectedBlock && firstData) {
        if (firstData.kind !== selectedBlock.kind) {
          await backend.changeBlockKind(selectedBlock.id, firstData.kind);
        }
        await writeBlockContent(backend, selectedBlock.id, firstData);
        session.markLocalMutation();
        firstNewBlockId = selectedBlock.id;
        afterBlockId = selectedBlock.id;
      } else if (firstData) {
        const doc = await backend.createBlockBelow(currentDocument.id, afterBlockId, firstData.kind);
        const created = doc.blocks.find((block) => !currentDocument.blocks.some((entry) => entry.id === block.id));
        if (created) {
          await writeBlockContent(backend, created.id, firstData);
          firstNewBlockId = created.id;
          afterBlockId = created.id;
        }
        session.markLocalMutation(doc.updatedAt);
        updateDocumentState(session, workspace, doc);
      }

      for (const data of blocksToInsert.slice(1)) {
        const latestDocument = session.getCurrentDocument();
        if (!latestDocument) break;

        const doc = await backend.createBlockBelow(latestDocument.id, afterBlockId, data.kind);
        const created = doc.blocks.find((block) => !latestDocument.blocks.some((entry) => entry.id === block.id));
        if (created) {
          await writeBlockContent(backend, created.id, data);
          firstNewBlockId = firstNewBlockId ?? created.id;
          afterBlockId = created.id;
        }
        session.markLocalMutation(doc.updatedAt);
        updateDocumentState(session, workspace, doc);
      }

      const finalDocument = await backend.openDocument(currentDocument.id);
      workspace.clearError();
      session.markLocalMutation(finalDocument.updatedAt);
      updateDocumentState(session, workspace, finalDocument);
      session.clearBlockSelection(true);
      if (firstNewBlockId) {
        session.requestBlockFocus(firstNewBlockId, 'start');
      }
    }, (message) => workspace.setError(message), '블록을 붙여넣지 못했습니다.');
  }

  async function deleteSelectedBlocks() {
    const currentDocument = session.getCurrentDocument();
    const selectedBlocks = getSelectedBlocks(session, currentDocument);
    if (!currentDocument || selectedBlocks.length === 0) return;

    history.pushUndo(currentDocument);
    session.setIsFlushing(true);

    try {
      await editorPersistence.flushDocument(currentDocument.id);
      let workingDocument = currentDocument;
      const selectedIds = new Set(selectedBlocks.map((block) => block.id));
      const selectedIndices = currentDocument.blocks
        .map((block, index) => (selectedIds.has(block.id) ? index : -1))
        .filter((index) => index >= 0);
      const firstSelectedIndex = selectedIndices[0] ?? -1;
      const lastSelectedIndex = selectedIndices.at(-1) ?? -1;
      const previousBlockId = firstSelectedIndex > 0 ? currentDocument.blocks[firstSelectedIndex - 1]?.id ?? null : null;
      const nextBlockId =
        lastSelectedIndex >= 0 && lastSelectedIndex < currentDocument.blocks.length - 1
          ? currentDocument.blocks[lastSelectedIndex + 1]?.id ?? null
          : null;
      const isWholeDocumentSelection = selectedBlocks.length === currentDocument.blocks.length;

      if (isWholeDocumentSelection) {
        const survivorId = selectedBlocks[0]?.id ?? null;
        for (const block of selectedBlocks.slice(1).reverse()) {
          editorPersistence.clearBlock(currentDocument.id, block.id);
          workingDocument = await backend.deleteBlock(block.id);
        }

        const survivor = survivorId
          ? workingDocument.blocks.find((block) => block.id === survivorId) ?? workingDocument.blocks[0] ?? null
          : null;
        if (survivor) {
          await clearBlockContent(survivor);
        }
      } else {
        for (const block of selectedBlocks.slice().reverse()) {
          editorPersistence.clearBlock(currentDocument.id, block.id);
          workingDocument = await backend.deleteBlock(block.id);
        }
      }

      const nextDocument = await backend.openDocument(currentDocument.id);
      workspace.clearError();
      session.markLocalMutation(nextDocument.updatedAt);
      updateDocumentState(session, workspace, nextDocument);
      session.clearBlockSelection(true);

      const focusTargetId =
        (previousBlockId && nextDocument.blocks.some((block) => block.id === previousBlockId) ? previousBlockId : null)
        ?? (nextBlockId && nextDocument.blocks.some((block) => block.id === nextBlockId) ? nextBlockId : null)
        ?? nextDocument.blocks[0]?.id
        ?? null;

      if (focusTargetId) {
        const caret = focusTargetId === previousBlockId ? 'end' : 'start';
        session.requestBlockFocus(focusTargetId, caret);
      }
    } catch (error) {
      workspace.setError(normalizeErrorMessage(error, '선택한 블록을 삭제하지 못했습니다.'));
    } finally {
      session.setIsFlushing(false);
    }
  }

  return {
    isBlockClipboardText,
    copySelectedBlocks,
    copySingleBlock,
    pasteBlocks,
    deleteSelectedBlocks,
  };
}
