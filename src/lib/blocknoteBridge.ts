/* eslint-disable @typescript-eslint/no-explicit-any */
export type BlockNoteEditorLike = {
  _tiptapEditor: any;
  document: any[];
  blocksToMarkdownLossy: (document?: any) => string;
  tryParseMarkdownToBlocks: (markdown: string) => any[];
  replaceBlocks: (blocks: any, replacement: any) => void;
  focus: () => void;
  setTextCursorPosition: (blockId: string, placement: 'start' | 'end') => void;
  getSelectedText: () => string;
  pasteMarkdown: (markdown: string) => void;
  updateBlock?: (blockOrId: any, update: any) => void;
  insertBlocks?: (blocksToInsert: any[], referenceBlock: any, placement?: 'before' | 'after') => void;
  removeBlocks?: (blocksToRemove: any[]) => void;
  getTextCursorPosition?: () => { block?: any };
  canNestBlock?: () => boolean;
  nestBlock?: () => void;
  canUnnestBlock?: () => boolean;
  unnestBlock?: () => void;
};

function getSelection(editor: BlockNoteEditorLike) {
  return editor._tiptapEditor.state.selection;
}

function dispatchTransaction(editor: BlockNoteEditorLike, transaction: unknown) {
  const dispatchable =
    transaction && typeof transaction === 'object' && 'scrollIntoView' in (transaction as Record<string, unknown>)
      ? (transaction as { scrollIntoView: () => unknown }).scrollIntoView()
      : transaction;
  editor._tiptapEditor.view.dispatch(dispatchable);
}

function getBlockId(block: unknown): string | null {
  if (!block || typeof block !== 'object' || !('id' in block)) {
    return null;
  }

  const { id } = block as { id?: unknown };
  return typeof id === 'string' ? id : null;
}

function getBlockChildren(block: unknown): unknown[] {
  if (!block || typeof block !== 'object' || !('children' in block)) {
    return [];
  }

  const { children } = block as { children?: unknown };
  return Array.isArray(children) ? children : [];
}

function findBlockById(blocks: unknown[], blockId: string): unknown | null {
  for (const block of blocks) {
    const id = getBlockId(block);
    if (id === blockId) {
      return block;
    }

    const match = findBlockById(getBlockChildren(block), blockId);
    if (match) {
      return match;
    }
  }

  return null;
}

function cloneBlockTree(block: unknown): unknown {
  if (Array.isArray(block)) {
    return block.map((item) => cloneBlockTree(item));
  }

  if (!block || typeof block !== 'object') {
    return block;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block)) {
    clone[key] = cloneBlockTree(value);
  }
  return clone;
}

function promoteCurrentBlockChildrenToSiblings(editor: BlockNoteEditorLike, blockId: string) {
  if (typeof editor.removeBlocks !== 'function' || typeof editor.insertBlocks !== 'function') {
    return false;
  }

  const currentBlock = findBlockById(editor.document, blockId);
  if (!currentBlock) {
    return false;
  }

  const children = getBlockChildren(currentBlock);
  if (children.length === 0) {
    return false;
  }

  const childrenToInsert = children.map((child) => cloneBlockTree(child));
  editor.removeBlocks(children);

  const updatedBlock = findBlockById(editor.document, blockId) ?? currentBlock;
  editor.insertBlocks(childrenToInsert, updatedBlock, 'after');
  return true;
}

function restoreCursorToBlockEnd(editor: BlockNoteEditorLike, blockId: string) {
  const restore = () => {
    try {
      editor.focus();
      editor.setTextCursorPosition(blockId, 'end');
    } catch {
      // BlockNote can briefly reject cursor placement while normalizing a block type change.
    }
  };

  restore();

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(restore);
  }
}

export function getBlockNoteMarkdown(editor: BlockNoteEditorLike) {
  return editor.blocksToMarkdownLossy(editor.document);
}

export function replaceBlockNoteMarkdown(editor: BlockNoteEditorLike, markdown: string, createEmptyBlocks: () => unknown[]) {
  const nextBlocks = markdown ? editor.tryParseMarkdownToBlocks(markdown) : createEmptyBlocks();
  editor.replaceBlocks(editor.document, nextBlocks);
}

export function hasBlockNoteSelection(editor: BlockNoteEditorLike) {
  const selection = getSelection(editor);
  return !selection.empty;
}

export function selectAllBlockNote(editor: BlockNoteEditorLike) {
  editor.focus();
  editor._tiptapEditor.commands.selectAll();
}

export function getBlockNoteTextBoundaries(editor: BlockNoteEditorLike) {
  const { selection, doc } = editor._tiptapEditor.state;
  if (!selection.empty) {
    return null;
  }

  let firstCursorPos: number | null = null;
  let lastCursorPos: number | null = null;
  let prevLastCursorPos: number | null = null;
  let lastNodeSize = 0;
  let lastNodeTypeName: string | null = null;

  doc.descendants((node: { isTextblock: boolean; nodeSize: number; textContent: string; type: { name: string } }, pos: number) => {
    if (!node.isTextblock) {
      return;
    }

    if (firstCursorPos === null) {
      firstCursorPos = pos + 1;
    }

    prevLastCursorPos = lastCursorPos;
    lastCursorPos = pos + node.nodeSize - 1;
    lastNodeSize = node.nodeSize;
    lastNodeTypeName = node.type.name;
  });

  if (firstCursorPos === null || lastCursorPos === null) {
    return null;
  }

  // 마지막 textblock이 빈 trailing paragraph(nodeSize <= 2)이고 다른 블록이 있으면 건너뛰기
  // paragraph 타입만 건너뜀 — 빈 listItem/taskItem은 의도한 내용이므로 제외
  const effectiveLastCursorPos =
    lastNodeSize <= 2 && lastNodeTypeName === 'paragraph' && prevLastCursorPos !== null
      ? prevLastCursorPos
      : lastCursorPos;

  return {
    firstCursorPos,
    lastCursorPos: effectiveLastCursorPos,
    selectionFrom: selection.from,
    selectionTo: selection.to,
  };
}

export function isAtBlockNoteBoundary(editor: BlockNoteEditorLike, direction: 'start' | 'end') {
  const boundaries = getBlockNoteTextBoundaries(editor);
  if (!boundaries) {
    return false;
  }

  return direction === 'start'
    ? boundaries.selectionFrom <= boundaries.firstCursorPos
    : boundaries.selectionTo >= boundaries.lastCursorPos;
}

export function replaceBlockNoteArrowShortcut(editor: BlockNoteEditorLike, shouldReplace: (text: string) => boolean) {
  const selection = getSelection(editor);
  if (!selection.empty) {
    return false;
  }

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parentOffset < 1) {
    return false;
  }

  const beforeText = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC');
  if (!shouldReplace(beforeText)) {
    return false;
  }

  const transaction = editor._tiptapEditor.state.tr.insertText('→', selection.from - 1, selection.from);
  dispatchTransaction(editor, transaction);
  return true;
}

export function replaceBlockNoteTaskShortcut(editor: BlockNoteEditorLike, shouldReplace: (text: string) => boolean) {
  if (typeof editor.updateBlock !== 'function' || typeof editor.getTextCursorPosition !== 'function') {
    return false;
  }

  const selection = getSelection(editor);
  if (!selection.empty) {
    return false;
  }

  const { $from } = selection;
  if (!$from.parent.isTextblock) {
    return false;
  }

  const beforeText = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC');
  const afterText = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, undefined, '\uFFFC');
  if (!shouldReplace(beforeText) || afterText.trim().length > 0) {
    return false;
  }

  const block = editor.getTextCursorPosition().block;
  const blockId = getBlockId(block);
  if (!blockId) {
    return false;
  }

  editor.updateBlock(block, {
    type: 'checkListItem',
    content: [],
  });
  restoreCursorToBlockEnd(editor, blockId);
  return true;
}

export function isBlockNoteSelectionEmpty(editor: BlockNoteEditorLike) {
  return getSelection(editor).empty;
}

export function deleteBlockNoteSelection(editor: BlockNoteEditorLike) {
  const selection = getSelection(editor);
  if (selection.empty) {
    return false;
  }

  const transaction = editor._tiptapEditor.state.tr.deleteSelection();
  dispatchTransaction(editor, transaction);
  return true;
}

function isEmptyTrailingBlock(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  if (b.type !== 'paragraph') return false;
  const content = b.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((item: unknown) => {
    if (!item || typeof item !== 'object') return true;
    const node = item as Record<string, unknown>;
    return node.type === 'text' && (typeof node.text === 'string' ? node.text.length === 0 : true);
  });
}

export function focusBlockNote(editor: BlockNoteEditorLike, focusPlacement: 'start' | 'end'): boolean {
  const view = editor._tiptapEditor?.view;
  if (!view?.dom?.isConnected) {
    return false;
  }

  let targetIndex = focusPlacement === 'start' ? 0 : editor.document.length - 1;

  // 'end' 배치 시 숨겨진 빈 trailing paragraph 건너뛰기
  if (focusPlacement === 'end' && targetIndex > 0 && isEmptyTrailingBlock(editor.document[targetIndex])) {
    targetIndex--;
  }

  const targetBlock = editor.document[targetIndex];
  if (!targetBlock || typeof targetBlock !== 'object' || !('id' in targetBlock)) {
    return false;
  }

  (view.dom as HTMLElement).focus();
  try {
    editor.setTextCursorPosition((targetBlock as { id: string }).id, focusPlacement);
  } catch {
    // setTextCursorPosition 실패 시에도 DOM focus는 유지
  }

  return view.hasFocus?.() ?? view.dom.contains(document.activeElement);
}

export function clearBlockNoteContent(editor: BlockNoteEditorLike, createEmptyBlocks: () => unknown[]) {
  editor.replaceBlocks(editor.document, createEmptyBlocks());
}

export function insertBlockNotePlainText(editor: BlockNoteEditorLike, text: string) {
  if (!text) {
    return false;
  }

  const transaction = editor._tiptapEditor.state.tr.insertText(text);
  dispatchTransaction(editor, transaction);
  return true;
}

export function canNestBlockNote(editor: BlockNoteEditorLike) {
  return typeof editor.canNestBlock === 'function' ? editor.canNestBlock() : false;
}

export function nestBlockNote(editor: BlockNoteEditorLike) {
  if (typeof editor.nestBlock !== 'function') {
    return false;
  }

  const cursorBlockId =
    typeof editor.getTextCursorPosition === 'function'
      ? getBlockId(editor.getTextCursorPosition().block)
      : null;

  editor.nestBlock();
  if (cursorBlockId) {
    // Match Notion-style absolute indentation: re-indenting a lifted block should not make its absorbed siblings deeper.
    promoteCurrentBlockChildrenToSiblings(editor, cursorBlockId);
  }
  return true;
}

export function canUnnestBlockNote(editor: BlockNoteEditorLike) {
  return typeof editor.canUnnestBlock === 'function' ? editor.canUnnestBlock() : false;
}

export function unnestBlockNote(editor: BlockNoteEditorLike) {
  if (typeof editor.unnestBlock !== 'function') {
    return false;
  }

  editor.unnestBlock();
  return true;
}
