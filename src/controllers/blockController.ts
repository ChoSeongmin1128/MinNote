import {
  reorderDocumentBlocks,
  replaceBlockInDocument,
  summarizeDocument,
  toBlockVm,
  toDocumentVm,
  type BlockVm,
} from '../adapters/documentAdapter';
import { desktopApi } from '../lib/desktopApi';
import type { CodeLanguageId } from '../lib/blockOptions';
import {
  createEmptyMarkdownContent,
  isMarkdownContentEmpty,
  serializeBlockToMarkdown,
  serializeDocumentToMarkdown,
} from '../lib/markdown';
import type { BlockKind } from '../lib/types';
import { clearBlockSync, flushDocumentSaves, queueDocumentSave } from '../services/documentSync';
import { enqueueSyncMutation } from '../services/syncBoundary';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  applyUpdatedBlock,
  clearError,
  findBlock,
  getCurrentDocument,
  normalizeErrorMessage,
  reportWorkspaceError,
  updateTouchedDocument,
} from './controllerSupport';
import { flushCurrentDocument } from './documentController';

function findEditableBlock<K extends BlockKind>(
  blockId: string,
  kind: K,
): { documentId: string; block: Extract<BlockVm, { kind: K }> } | null {
  const currentDocument = getCurrentDocument();
  if (!currentDocument) {
    return null;
  }

  const block = findBlock(currentDocument, blockId);
  if (!block || block.kind !== kind) {
    return null;
  }

  return {
    documentId: currentDocument.id,
    block: block as Extract<BlockVm, { kind: K }>,
  };
}

function queueAndApplyBlockUpdate(blockId: string, nextBlock: BlockVm, payload: Parameters<typeof queueDocumentSave>[2]) {
  queueDocumentSave(nextBlock.documentId, blockId, payload);
  applyUpdatedBlock(nextBlock);
}

export async function createBlockBelow(afterBlockId: string | null, kind: BlockKind = 'markdown') {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    await flushCurrentDocument();
    const nextDocument = toDocumentVm(
      await desktopApi.createBlockBelow(currentDocument.id, afterBlockId, kind),
    );

    const nextBlock =
      nextDocument.blocks.find((block) => {
        if (afterBlockId == null) {
          return block.position === 0;
        }
        const source = currentDocument.blocks.find((entry) => entry.id === afterBlockId);
        return source ? block.position === source.position + 1 : false;
      }) ??
      nextDocument.blocks.at(-1) ??
      null;

    clearError();
    useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(nextDocument));
    const targetBlock = nextBlock ?? nextDocument.blocks[0] ?? null;
    useDocumentSessionStore.setState({
      currentDocument: nextDocument,
      selectedBlockId: targetBlock?.id ?? null,
      allBlocksSelected: false,
      focusRequest: targetBlock
        ? { blockId: targetBlock.id, caret: 'start' as const, nonce: Date.now() + Math.random() }
        : null,
      lastSavedAt: nextDocument.updatedAt,
    });
    if (nextBlock) {
      enqueueSyncMutation({ kind: 'block-created', documentId: nextDocument.id, blockId: nextBlock.id });
    }
  } catch (error) {
    reportWorkspaceError(error, '블록을 만들지 못했습니다.');
  }
}

export async function changeBlockKind(blockId: string, kind: BlockKind) {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    const nextBlock = toBlockVm(await desktopApi.changeBlockKind(blockId, kind));
    const replaced = replaceBlockInDocument(currentDocument, nextBlock);
    clearBlockSync(currentDocument.id, blockId);
    clearError();
    updateTouchedDocument(replaced);
    enqueueSyncMutation({ kind: 'block-updated', documentId: currentDocument.id, blockId });
  } catch (error) {
    reportWorkspaceError(error, '블록 형식을 바꾸지 못했습니다.');
  }
}

export async function moveBlock(blockId: string, targetPosition: number) {
  const currentDocument = getCurrentDocument();
  if (!currentDocument) {
    return;
  }

  const sourceIndex = currentDocument.blocks.findIndex((block) => block.id === blockId);
  if (sourceIndex < 0 || sourceIndex === targetPosition) {
    return;
  }

  const previousDocument = currentDocument;
  const optimisticDocument = reorderDocumentBlocks(currentDocument, blockId, targetPosition);
  clearError();
  useDocumentSessionStore.setState({
    currentDocument: optimisticDocument,
    selectedBlockId: blockId,
    allBlocksSelected: false,
    focusRequest: {
      blockId,
      caret: 'start',
      nonce: Date.now() + Math.random(),
    },
  });
  useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(optimisticDocument));
  useDocumentSessionStore.getState().setIsFlushing(true);

  try {
    await flushDocumentSaves(previousDocument.id);
    const nextDocument = toDocumentVm(
      await desktopApi.moveBlock(previousDocument.id, blockId, targetPosition),
    );
    updateTouchedDocument(nextDocument);
    useDocumentSessionStore.getState().requestBlockFocus(blockId, 'start');
    enqueueSyncMutation({ kind: 'document-reordered-blocks', documentId: nextDocument.id });
  } catch (error) {
    useDocumentSessionStore.setState({
      currentDocument: previousDocument,
      selectedBlockId: blockId,
      allBlocksSelected: false,
    });
    useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(previousDocument));
    useWorkspaceStore.getState().setError(normalizeErrorMessage(error, '블록 순서를 저장하지 못했습니다.'));
  } finally {
    useDocumentSessionStore.getState().setIsFlushing(false);
  }
}

export async function deleteBlock(blockId: string) {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument || currentDocument.blocks.length <= 1) {
      return;
    }

    const deletedIndex = currentDocument.blocks.findIndex((block) => block.id === blockId);
    const previousBlock = deletedIndex > 0 ? currentDocument.blocks[deletedIndex - 1] : null;
    const nextBlock = deletedIndex >= 0 ? currentDocument.blocks[deletedIndex + 1] ?? null : null;

    clearBlockSync(currentDocument.id, blockId);
    const nextDocument = toDocumentVm(await desktopApi.deleteBlock(blockId));
    clearError();
    updateTouchedDocument(nextDocument);
    enqueueSyncMutation({ kind: 'block-deleted', documentId: nextDocument.id, blockId });

    if (previousBlock?.id) {
      useDocumentSessionStore.getState().requestBlockFocus(previousBlock.id, 'end');
    } else if (nextBlock?.id) {
      useDocumentSessionStore.getState().requestBlockFocus(nextBlock.id, 'start');
    }
  } catch (error) {
    reportWorkspaceError(error, '블록을 삭제하지 못했습니다.');
  }
}

export function updateMarkdownBlock(blockId: string, content: string) {
  const editable = findEditableBlock(blockId, 'markdown');
  if (!editable) {
    return;
  }

  const nextBlock: BlockVm = {
    ...editable.block,
    content,
    updatedAt: Date.now(),
  };

  queueAndApplyBlockUpdate(blockId, nextBlock, { kind: 'markdown', content });
}

export function updateCodeBlock(blockId: string, content: string, language: CodeLanguageId | null) {
  const editable = findEditableBlock(blockId, 'code');
  if (!editable) {
    return;
  }

  const nextLanguage = language ?? 'plaintext';
  const nextBlock: BlockVm = {
    ...editable.block,
    content,
    language: nextLanguage,
    updatedAt: Date.now(),
  };

  queueAndApplyBlockUpdate(blockId, nextBlock, {
    kind: 'code',
    content,
    language: nextLanguage,
  });
}

export function updateTextBlock(blockId: string, content: string) {
  const editable = findEditableBlock(blockId, 'text');
  if (!editable) {
    return;
  }

  const nextBlock: BlockVm = {
    ...editable.block,
    content,
    updatedAt: Date.now(),
  };

  queueAndApplyBlockUpdate(blockId, nextBlock, { kind: 'text', content });
}

export async function copySelectedBlocks() {
  const currentDocument = getCurrentDocument();
  const allBlocksSelected = useDocumentSessionStore.getState().allBlocksSelected;
  if (!currentDocument || !allBlocksSelected) {
    return;
  }

  const text = serializeDocumentToMarkdown(currentDocument.blocks);
  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
}

export async function copySingleBlock(blockId: string) {
  const currentDocument = getCurrentDocument();
  if (!currentDocument) {
    return;
  }

  const block = findBlock(currentDocument, blockId);
  if (!block) {
    return;
  }

  const text = serializeBlockToMarkdown(block);
  if (!text) {
    return;
  }

  await navigator.clipboard.writeText(text);
}

export async function pasteBlocks() {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      return;
    }

    const selectedBlockId = useDocumentSessionStore.getState().selectedBlockId;
    const selectedBlock = selectedBlockId ? findBlock(currentDocument, selectedBlockId) : null;

    // 선택된 블록이 비어있으면 해당 블록에 내용 채우기
    if (selectedBlock && selectedBlock.kind === 'markdown' && isMarkdownContentEmpty(selectedBlock.content)) {
      updateMarkdownBlock(selectedBlock.id, text);
      useDocumentSessionStore.getState().setBlockSelected(false);
      useDocumentSessionStore.getState().setAllBlocksSelected(false);
      return;
    }

    if (selectedBlock && selectedBlock.kind === 'text' && !selectedBlock.content.trim()) {
      updateTextBlock(selectedBlock.id, text);
      useDocumentSessionStore.getState().setBlockSelected(false);
      useDocumentSessionStore.getState().setAllBlocksSelected(false);
      return;
    }

    // 비어있지 않으면 아래에 새 블록 추가
    const afterBlockId = selectedBlockId ?? currentDocument.blocks.at(-1)?.id ?? null;
    await flushCurrentDocument();
    const nextDocument = toDocumentVm(
      await desktopApi.createBlockBelow(currentDocument.id, afterBlockId, 'markdown'),
    );

    const newBlock = nextDocument.blocks.find((block) => {
      if (!afterBlockId) return block.position === 0;
      const source = currentDocument.blocks.find((entry) => entry.id === afterBlockId);
      return source ? block.position === source.position + 1 : false;
    }) ?? nextDocument.blocks.at(-1) ?? null;

    if (newBlock) {
      clearError();
      useWorkspaceStore.getState().upsertDocumentSummary(summarizeDocument(nextDocument));
      useDocumentSessionStore.setState({
        currentDocument: nextDocument,
        selectedBlockId: newBlock.id,
        blockSelected: false,
        allBlocksSelected: false,
        focusRequest: { blockId: newBlock.id, caret: 'start' as const, nonce: Date.now() + Math.random() },
        lastSavedAt: nextDocument.updatedAt,
      });
      updateMarkdownBlock(newBlock.id, text);
    }
  } catch (error) {
    reportWorkspaceError(error, '블록을 붙여넣지 못했습니다.');
  }
}

export async function deleteSelectedBlocks() {
  const session = useDocumentSessionStore.getState();
  const currentDocument = session.currentDocument;
  if (!currentDocument || !session.allBlocksSelected || currentDocument.blocks.length === 0) {
    return;
  }

  useDocumentSessionStore.getState().setIsFlushing(true);

  try {
    await flushDocumentSaves(currentDocument.id);

    let workingDocument = currentDocument;
    const survivorId = currentDocument.blocks[0]?.id ?? null;

    for (const block of currentDocument.blocks.slice(1)) {
      clearBlockSync(currentDocument.id, block.id);
      workingDocument = toDocumentVm(await desktopApi.deleteBlock(block.id));
      enqueueSyncMutation({ kind: 'block-deleted', documentId: currentDocument.id, blockId: block.id });
    }

    const survivor = survivorId
      ? workingDocument.blocks.find((block) => block.id === survivorId) ?? workingDocument.blocks[0] ?? null
      : null;

    if (survivor) {
      if (survivor.kind === 'markdown' && !isMarkdownContentEmpty(survivor.content)) {
        await desktopApi.updateMarkdownBlock(survivor.id, createEmptyMarkdownContent());
        enqueueSyncMutation({ kind: 'block-updated', documentId: currentDocument.id, blockId: survivor.id });
      } else if (survivor.kind === 'code' && survivor.content.length > 0) {
        await desktopApi.updateCodeBlock(survivor.id, '', survivor.language);
        enqueueSyncMutation({ kind: 'block-updated', documentId: currentDocument.id, blockId: survivor.id });
      } else if (survivor.kind === 'text' && survivor.content.length > 0) {
        await desktopApi.updateTextBlock(survivor.id, '');
        enqueueSyncMutation({ kind: 'block-updated', documentId: currentDocument.id, blockId: survivor.id });
      }
    }

    const nextDocument = toDocumentVm(await desktopApi.openDocument(currentDocument.id));
    clearError();
    updateTouchedDocument(nextDocument);
    useDocumentSessionStore.getState().setAllBlocksSelected(false);

    if (nextDocument.blocks[0]) {
      useDocumentSessionStore.getState().requestBlockFocus(nextDocument.blocks[0].id, 'start');
    }
  } catch (error) {
    reportWorkspaceError(error, '선택한 블록을 삭제하지 못했습니다.');
  } finally {
    useDocumentSessionStore.getState().setIsFlushing(false);
  }
}
