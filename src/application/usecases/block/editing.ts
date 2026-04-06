import {
  reorderDocumentBlocks,
  replaceBlockInDocument,
  type BlockVm,
} from '../../models/document';
import type { BlockKind } from '../../../lib/types';
import type { CodeLanguageId } from '../../../lib/codeLanguageRegistry';
import { createEmptyMarkdownContent } from '../../../lib/markdown';
import { setDocumentWithFocus, updateDocumentState } from '../shared/documentState';
import { executeWithErrorHandling, normalizeErrorMessage } from '../shared/errors';
import { findEditableBlock, queueAndApplyBlockUpdate } from './shared';
import type { BlockUseCaseDeps } from './types';

async function clearBlockContent(
  backend: BlockUseCaseDeps['backend'],
  block: BlockVm,
) {
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

export function createBlockEditingActions({
  backend,
  editorPersistence,
  flushCurrentDocument,
  history,
  session,
  workspace,
}: Pick<BlockUseCaseDeps, 'backend' | 'editorPersistence' | 'flushCurrentDocument' | 'history' | 'session' | 'workspace'>) {
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
      session.markLocalMutation(nextDocument.updatedAt);
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
      session.markLocalMutation(nextBlock.updatedAt);
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
    session.markLocalMutation(optimisticDocument.updatedAt);
    setDocumentWithFocus(session, workspace, optimisticDocument, blockId, 'start');
    session.setIsFlushing(true);

    try {
      await editorPersistence.flushDocument(previousDocument.id);
      const nextDocument = await backend.moveBlock(previousDocument.id, blockId, targetPosition);
      session.markLocalMutation(nextDocument.updatedAt);
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
      session.markLocalMutation(nextDocument.updatedAt);
      updateDocumentState(session, workspace, nextDocument);

      const focusTarget = previousBlock?.id ?? nextBlock?.id;
      if (focusTarget) {
        session.requestBlockFocus(focusTarget, previousBlock ? 'end' : 'start');
      }
    }, (message) => workspace.setError(message), '블록을 삭제하지 못했습니다.');
  }

  function updateMarkdownBlock(blockId: string, content: string) {
    const editable = findEditableBlock(session, blockId, 'markdown');
    if (!editable) return;

    queueAndApplyBlockUpdate(
      session,
      workspace,
      editorPersistence.queueBlockSave.bind(editorPersistence),
      blockId,
      { ...editable.block, content, updatedAt: Date.now() },
      { kind: 'markdown', content },
    );
  }

  function updateCodeBlock(blockId: string, content: string, language: CodeLanguageId | null) {
    const editable = findEditableBlock(session, blockId, 'code');
    if (!editable) return;

    const nextLanguage = language ?? 'plaintext';
    queueAndApplyBlockUpdate(
      session,
      workspace,
      editorPersistence.queueBlockSave.bind(editorPersistence),
      blockId,
      { ...editable.block, content, language: nextLanguage, updatedAt: Date.now() },
      { kind: 'code', content, language: nextLanguage },
    );
  }

  function updateTextBlock(blockId: string, content: string) {
    const editable = findEditableBlock(session, blockId, 'text');
    if (!editable) return;

    queueAndApplyBlockUpdate(
      session,
      workspace,
      editorPersistence.queueBlockSave.bind(editorPersistence),
      blockId,
      { ...editable.block, content, updatedAt: Date.now() },
      { kind: 'text', content },
    );
  }

  return {
    clearBlockContent: (block: BlockVm) => clearBlockContent(backend, block),
    createBlockBelow,
    changeBlockKind,
    moveBlock,
    deleteBlock,
    updateMarkdownBlock,
    updateCodeBlock,
    updateTextBlock,
  };
}
