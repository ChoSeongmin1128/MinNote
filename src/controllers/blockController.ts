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

const BLOCK_CLIPBOARD_PREFIX = '<!--minnote-block:';
const BLOCK_CLIPBOARD_SUFFIX = '-->';

interface ClipboardBlockData {
  kind: BlockKind;
  content: string;
  language?: string | null;
}

function encodeBlockClipboard(blocks: ClipboardBlockData[]): string {
  const meta = `${BLOCK_CLIPBOARD_PREFIX}${JSON.stringify(blocks)}${BLOCK_CLIPBOARD_SUFFIX}\n`;
  const text = blocks.map((b) => serializeBlockToMarkdown(b)).join('\n\n');
  return `${meta}${text}`;
}

function decodeBlockClipboard(text: string): ClipboardBlockData[] | null {
  if (!text.startsWith(BLOCK_CLIPBOARD_PREFIX)) return null;
  const endIndex = text.indexOf(BLOCK_CLIPBOARD_SUFFIX);
  if (endIndex < 0) return null;
  try {
    return JSON.parse(text.slice(BLOCK_CLIPBOARD_PREFIX.length, endIndex));
  } catch {
    return null;
  }
}

export async function copySelectedBlocks() {
  const currentDocument = getCurrentDocument();
  const allBlocksSelected = useDocumentSessionStore.getState().allBlocksSelected;
  if (!currentDocument || !allBlocksSelected) {
    return;
  }

  const blockData: ClipboardBlockData[] = currentDocument.blocks.map((b) => ({
    kind: b.kind,
    content: b.content,
    language: b.kind === 'code' ? b.language : null,
  }));

  await navigator.clipboard.writeText(encodeBlockClipboard(blockData));
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

  const blockData: ClipboardBlockData[] = [{
    kind: block.kind,
    content: block.content,
    language: block.kind === 'code' ? block.language : null,
  }];

  await navigator.clipboard.writeText(encodeBlockClipboard(blockData));
}

export async function pasteBlocks() {
  try {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) {
      return;
    }

    const clipText = await navigator.clipboard.readText();
    if (!clipText.trim()) {
      return;
    }

    const blockData = decodeBlockClipboard(clipText);
    const selectedBlockId = useDocumentSessionStore.getState().selectedBlockId;
    const selectedBlock = selectedBlockId ? findBlock(currentDocument, selectedBlockId) : null;
    const isSelectedEmpty = selectedBlock
      ? (selectedBlock.kind === 'code' ? !selectedBlock.content.trim() : isMarkdownContentEmpty(selectedBlock.content))
      : false;

    const blocksToInsert: ClipboardBlockData[] = blockData ?? [{ kind: 'markdown', content: clipText }];

    await flushCurrentDocument();
    let afterBlockId = selectedBlockId ?? currentDocument.blocks.at(-1)?.id ?? null;
    let firstNewBlockId: string | null = null;

    // 첫 번째 블록: 비어있으면 덮어쓰기
    const firstData = blocksToInsert[0];
    if (isSelectedEmpty && selectedBlock && firstData) {
      if (firstData.kind !== selectedBlock.kind) {
        await desktopApi.changeBlockKind(selectedBlock.id, firstData.kind);
      }
      if (firstData.kind === 'markdown' || firstData.kind === 'text') {
        await desktopApi.updateMarkdownBlock(selectedBlock.id, firstData.content);
      } else if (firstData.kind === 'code') {
        await desktopApi.updateCodeBlock(selectedBlock.id, firstData.content, firstData.language ?? null);
      }
      firstNewBlockId = selectedBlock.id;
      afterBlockId = selectedBlock.id;
    } else if (firstData) {
      const doc = toDocumentVm(await desktopApi.createBlockBelow(currentDocument.id, afterBlockId, firstData.kind));
      const created = doc.blocks.find((b) => !currentDocument.blocks.some((ob) => ob.id === b.id));
      if (created) {
        if (firstData.kind === 'markdown' || firstData.kind === 'text') {
          await desktopApi.updateMarkdownBlock(created.id, firstData.content);
        } else if (firstData.kind === 'code') {
          await desktopApi.updateCodeBlock(created.id, firstData.content, firstData.language ?? null);
        }
        firstNewBlockId = firstNewBlockId ?? created.id;
        afterBlockId = created.id;
      }
    }

    // 나머지 블록: 아래에 추가
    for (const data of blocksToInsert.slice(1)) {
      const latestDoc = getCurrentDocument();
      if (!latestDoc) break;
      const doc = toDocumentVm(await desktopApi.createBlockBelow(latestDoc.id, afterBlockId, data.kind));
      const created = doc.blocks.find((b) => !latestDoc.blocks.some((ob) => ob.id === b.id));
      if (created) {
        if (data.kind === 'markdown' || data.kind === 'text') {
          await desktopApi.updateMarkdownBlock(created.id, data.content);
        } else if (data.kind === 'code') {
          await desktopApi.updateCodeBlock(created.id, data.content, data.language ?? null);
        }
        firstNewBlockId = firstNewBlockId ?? created.id;
        afterBlockId = created.id;
      }
      updateTouchedDocument(doc);
    }

    const finalDoc = toDocumentVm(await desktopApi.openDocument(currentDocument.id));
    clearError();
    updateTouchedDocument(finalDoc);
    useDocumentSessionStore.setState({
      blockSelected: false,
      allBlocksSelected: false,
    });
    if (firstNewBlockId) {
      useDocumentSessionStore.getState().requestBlockFocus(firstNewBlockId, 'start');
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
