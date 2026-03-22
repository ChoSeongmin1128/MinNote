import type { BlockVm } from '../adapters/documentAdapter';
import { isMarkdownContentEmpty } from '../lib/markdown';
import type { BlockKind } from '../lib/types';
import type { ContextMenuItem } from './ContextMenu';
import { preloadEditorForBlockKind } from './editors/editorLoaders';

export function isEffectivelyEmpty(block: BlockVm) {
  if (block.kind === 'markdown' || block.kind === 'text') {
    return isMarkdownContentEmpty(block.content);
  }

  return block.content.trim().length === 0;
}

export function preloadBlockCardEditor(kind: BlockKind) {
  return preloadEditorForBlockKind(kind);
}

export function buildBlockContextMenuItems(): ContextMenuItem[] {
  return [
    { id: 'cut', label: '잘라내기' },
    { id: 'copy', label: '복사' },
    { id: 'paste', label: '붙여넣기' },
    { id: 'select-all', label: '전체 선택' },
    { type: 'separator', id: 'separator-delete' },
    { id: 'delete-block', label: '블록 삭제', danger: true },
  ];
}

interface BlockContextActionHandlers {
  onCut: () => Promise<void>;
  onCopy: () => Promise<void>;
  onPaste: () => Promise<void>;
  onSelectAll: () => Promise<void>;
  onDelete: () => void;
}

export async function handleBlockContextAction(
  actionId: string,
  handlers: BlockContextActionHandlers,
) {
  if (actionId === 'cut') {
    await handlers.onCut();
    return;
  }

  if (actionId === 'copy') {
    await handlers.onCopy();
    return;
  }

  if (actionId === 'paste') {
    await handlers.onPaste();
    return;
  }

  if (actionId === 'select-all') {
    await handlers.onSelectAll();
    return;
  }

  if (actionId === 'delete-block') {
    handlers.onDelete();
  }
}
