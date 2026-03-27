import {
  reorderDocumentBlocks,
  replaceBlockInDocument,
  type BlockVm,
} from '../../models/document';
import type { BackendPort } from '../../ports/backendPort';
import type { ClipboardPort } from '../../ports/clipboardPort';
import type { EditorPersistencePort, PendingBlockSave } from '../../ports/editorPersistencePort';
import type { HistoryGateway } from '../../ports/historyGateway';
import type { SessionGateway } from '../../ports/sessionGateway';
import type { WorkspaceGateway } from '../../ports/workspaceGateway';
import { isBlockClipboardText, parseBlockClipboardText, type ClipboardBlockData } from '../../../lib/blockClipboardCodec';
import { createEmptyMarkdownContent, isMarkdownContentEmpty } from '../../../lib/markdown';
import type { CodeLanguageId } from '../../../lib/codeLanguageRegistry';
import type { BlockKind } from '../../../lib/types';
import { findBlock, setDocumentWithFocus, updateDocumentState } from '../shared/documentState';
import { executeWithErrorHandling, normalizeErrorMessage } from '../shared/errors';

interface BlockUseCaseDeps {
  backend: BackendPort;
  clipboard: ClipboardPort;
  editorPersistence: EditorPersistencePort;
  flushCurrentDocument: () => Promise<void>;
  history: HistoryGateway;
  session: SessionGateway;
  workspace: WorkspaceGateway;
}

function toClipboardBlocks(blocks: BlockVm[]): ClipboardBlockData[] {
  return blocks.map((block) => ({
    kind: block.kind,
    content: block.content,
    language: block.kind === 'code' ? block.language : null,
  }));
}

export function createBlockUseCases({
  backend,
  clipboard,
  editorPersistence,
  flushCurrentDocument,
  history,
  session,
  workspace,
}: BlockUseCaseDeps) {
  function findEditableBlock<K extends BlockKind>(
    blockId: string,
    kind: K,
  ): { documentId: string; block: Extract<BlockVm, { kind: K }> } | null {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return null;

    const block = findBlock(currentDocument, blockId);
    if (!block || block.kind !== kind) return null;

    return { documentId: currentDocument.id, block: block as Extract<BlockVm, { kind: K }> };
  }

  function applyUpdatedBlock(block: BlockVm) {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return;

    updateDocumentState(session, workspace, {
      ...currentDocument,
      blocks: currentDocument.blocks
        .map((entry) => (entry.id === block.id ? block : entry))
        .sort((left, right) => left.position - right.position),
    });
  }

  function queueAndApplyBlockUpdate(blockId: string, nextBlock: BlockVm, payload: PendingBlockSave) {
    editorPersistence.queueBlockSave(nextBlock.documentId, blockId, payload);
    applyUpdatedBlock(nextBlock);
  }

  function getSelectedBlocks(document = session.getCurrentDocument()) {
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

  function getSelectionInsertAfterBlockId(document: NonNullable<ReturnType<SessionGateway['getCurrentDocument']>>) {
    const selection = session.getSelectionState();
    if (selection.allBlocksSelected) {
      return document.blocks.at(-1)?.id ?? null;
    }

    if (selection.selectedBlockIds.length > 0) {
      return selection.selectedBlockIds.at(-1) ?? document.blocks.at(-1)?.id ?? null;
    }

    return selection.selectedBlockId ?? document.blocks.at(-1)?.id ?? null;
  }

  async function clearBlockContent(block: BlockVm) {
    if (block.kind === 'markdown') {
      await backend.updateMarkdownBlock(block.id, createEmptyMarkdownContent());
      return;
    }

    if (block.kind === 'text') {
      await backend.updateTextBlock(block.id, '');
      return;
    }

    await backend.updateCodeBlock(block.id, '', block.language);
  }

  async function createBlockBelow(afterBlockId: string | null, kind: BlockKind = 'markdown') {
    const snapshotDocument = session.getCurrentDocument();
    if (snapshotDocument) {
      history.pushUndo(snapshotDocument);
    }
    session.clearActiveEditorRef();

    await executeWithErrorHandling(async () => {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) return;

      await flushCurrentDocument();
      const nextDocument = await backend.createBlockBelow(currentDocument.id, afterBlockId, kind);

      const nextBlock =
        nextDocument.blocks.find((block) => {
          if (afterBlockId == null) return block.position === 0;
          const source = currentDocument.blocks.find((entry) => entry.id === afterBlockId);
          return source ? block.position === source.position + 1 : false;
        }) ?? nextDocument.blocks.at(-1) ?? null;

      workspace.clearError();
      setDocumentWithFocus(session, workspace, nextDocument, nextBlock?.id ?? null, 'start');
    }, (message) => workspace.setError(message), '블록을 만들지 못했습니다.');
  }

  async function changeBlockKind(blockId: string, kind: BlockKind) {
    const snapshotDocument = session.getCurrentDocument();
    if (snapshotDocument) {
      history.pushUndo(snapshotDocument);
    }
    session.clearActiveEditorRef();

    await executeWithErrorHandling(async () => {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument) return;

      const nextBlock = await backend.changeBlockKind(blockId, kind);
      const replaced = replaceBlockInDocument(currentDocument, nextBlock);
      editorPersistence.clearBlock(currentDocument.id, blockId);
      workspace.clearError();
      updateDocumentState(session, workspace, replaced);
    }, (message) => workspace.setError(message), '블록 형식을 바꾸지 못했습니다.');
  }

  async function moveBlock(blockId: string, targetPosition: number) {
    const currentDocument = session.getCurrentDocument();
    if (!currentDocument) return;

    history.pushUndo(currentDocument);
    session.clearActiveEditorRef();

    const sourceIndex = currentDocument.blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex < 0 || sourceIndex === targetPosition) return;

    const previousDocument = currentDocument;
    const optimisticDocument = reorderDocumentBlocks(currentDocument, blockId, targetPosition);
    workspace.clearError();
    setDocumentWithFocus(session, workspace, optimisticDocument, blockId, 'start');
    session.setIsFlushing(true);

    try {
      await editorPersistence.flushDocument(previousDocument.id);
      const nextDocument = await backend.moveBlock(previousDocument.id, blockId, targetPosition);
      updateDocumentState(session, workspace, nextDocument);
      session.requestBlockFocus(blockId, 'start');
    } catch (error) {
      setDocumentWithFocus(session, workspace, previousDocument, blockId, 'start');
      workspace.setError(normalizeErrorMessage(error, '블록 순서를 저장하지 못했습니다.'));
    } finally {
      session.setIsFlushing(false);
    }
  }

  async function deleteBlock(blockId: string) {
    const snapshotDocument = session.getCurrentDocument();
    if (snapshotDocument && snapshotDocument.blocks.length > 1) {
      history.pushUndo(snapshotDocument);
    }
    session.clearActiveEditorRef();

    await executeWithErrorHandling(async () => {
      const currentDocument = session.getCurrentDocument();
      if (!currentDocument || currentDocument.blocks.length <= 1) return;

      const deletedIndex = currentDocument.blocks.findIndex((block) => block.id === blockId);
      const previousBlock = deletedIndex > 0 ? currentDocument.blocks[deletedIndex - 1] : null;
      const nextBlock = deletedIndex >= 0 ? currentDocument.blocks[deletedIndex + 1] ?? null : null;

      editorPersistence.clearBlock(currentDocument.id, blockId);
      const nextDocument = await backend.deleteBlock(blockId);
      workspace.clearError();
      updateDocumentState(session, workspace, nextDocument);

      const focusTarget = previousBlock?.id ?? nextBlock?.id;
      if (focusTarget) {
        session.requestBlockFocus(focusTarget, previousBlock ? 'end' : 'start');
      }
    }, (message) => workspace.setError(message), '블록을 삭제하지 못했습니다.');
  }

  function updateMarkdownBlock(blockId: string, content: string) {
    const editable = findEditableBlock(blockId, 'markdown');
    if (!editable) return;

    queueAndApplyBlockUpdate(
      blockId,
      { ...editable.block, content, updatedAt: Date.now() },
      { kind: 'markdown', content },
    );
  }

  function updateCodeBlock(blockId: string, content: string, language: CodeLanguageId | null) {
    const editable = findEditableBlock(blockId, 'code');
    if (!editable) return;

    const nextLanguage = language ?? 'plaintext';
    queueAndApplyBlockUpdate(
      blockId,
      { ...editable.block, content, language: nextLanguage, updatedAt: Date.now() },
      { kind: 'code', content, language: nextLanguage },
    );
  }

  function updateTextBlock(blockId: string, content: string) {
    const editable = findEditableBlock(blockId, 'text');
    if (!editable) return;

    queueAndApplyBlockUpdate(
      blockId,
      { ...editable.block, content, updatedAt: Date.now() },
      { kind: 'text', content },
    );
  }

  async function copySelectedBlocks() {
    const blocks = getSelectedBlocks();
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

  async function writeBlockContent(blockId: string, data: ClipboardBlockData) {
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
      let afterBlockId = getSelectionInsertAfterBlockId(currentDocument);
      let firstNewBlockId: string | null = null;

      const firstData = blocksToInsert[0];
      if (canOverwriteSelectedBlock && isSelectedEmpty && selectedBlock && firstData) {
        if (firstData.kind !== selectedBlock.kind) {
          await backend.changeBlockKind(selectedBlock.id, firstData.kind);
        }
        await writeBlockContent(selectedBlock.id, firstData);
        firstNewBlockId = selectedBlock.id;
        afterBlockId = selectedBlock.id;
      } else if (firstData) {
        const doc = await backend.createBlockBelow(currentDocument.id, afterBlockId, firstData.kind);
        const created = doc.blocks.find((block) => !currentDocument.blocks.some((entry) => entry.id === block.id));
        if (created) {
          await writeBlockContent(created.id, firstData);
          firstNewBlockId = created.id;
          afterBlockId = created.id;
        }
        updateDocumentState(session, workspace, doc);
      }

      for (const data of blocksToInsert.slice(1)) {
        const latestDocument = session.getCurrentDocument();
        if (!latestDocument) break;

        const doc = await backend.createBlockBelow(latestDocument.id, afterBlockId, data.kind);
        const created = doc.blocks.find((block) => !latestDocument.blocks.some((entry) => entry.id === block.id));
        if (created) {
          await writeBlockContent(created.id, data);
          firstNewBlockId = firstNewBlockId ?? created.id;
          afterBlockId = created.id;
        }
        updateDocumentState(session, workspace, doc);
      }

      const finalDocument = await backend.openDocument(currentDocument.id);
      workspace.clearError();
      updateDocumentState(session, workspace, finalDocument);
      session.clearBlockSelection(true);
      if (firstNewBlockId) {
        session.requestBlockFocus(firstNewBlockId, 'start');
      }
    }, (message) => workspace.setError(message), '블록을 붙여넣지 못했습니다.');
  }

  async function deleteSelectedBlocks() {
    const currentDocument = session.getCurrentDocument();
    const selectedBlocks = getSelectedBlocks(currentDocument);
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
        previousDocument.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          content: block.content,
          language: block.kind === 'code' ? block.language : null,
          position: block.position,
        })),
      );
      workspace.clearError();
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
        nextDocument.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          content: block.content,
          language: block.kind === 'code' ? block.language : null,
          position: block.position,
        })),
      );
      workspace.clearError();
      updateDocumentState(session, workspace, restored);
      session.clearBlockSelection(true);
      const focusId = restored.blocks[0]?.id ?? null;
      if (focusId) {
        session.requestBlockFocus(focusId, 'start');
      }
    }, (message) => workspace.setError(message), '다시 실행에 실패했습니다.');
  }

  return {
    createBlockBelow,
    changeBlockKind,
    moveBlock,
    deleteBlock,
    updateMarkdownBlock,
    updateCodeBlock,
    updateTextBlock,
    isBlockClipboardText,
    copySelectedBlocks,
    copySingleBlock,
    pasteBlocks,
    deleteSelectedBlocks,
    undoBlockOperation,
    redoBlockOperation,
  };
}
