import type { CodeLanguageId } from '../../lib/codeLanguageRegistry';
import { getBlockPlainText } from '../../lib/markdown';
import type { BlockKind, BlockTintPreset, DocumentSurfaceTonePreset } from '../../lib/types';

interface BlockVmBase {
  id: string;
  documentId: string;
  kind: BlockKind;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface MarkdownBlockVm extends BlockVmBase {
  kind: 'markdown';
  content: string;
  language: null;
}

export interface CodeBlockVm extends BlockVmBase {
  kind: 'code';
  content: string;
  language: CodeLanguageId;
}

export interface TextBlockVm extends BlockVmBase {
  kind: 'text';
  content: string;
  language: null;
}

export type BlockVm = MarkdownBlockVm | CodeBlockVm | TextBlockVm;

export interface DocumentSummaryVm {
  id: string;
  title: string | null;
  blockTintOverride: BlockTintPreset | null;
  documentSurfaceToneOverride: DocumentSurfaceTonePreset | null;
  preview: string;
  updatedAt: number;
  lastOpenedAt: number;
  blockCount: number;
}

export interface DocumentVm extends DocumentSummaryVm {
  blocks: BlockVm[];
}

export interface SearchResultVm extends DocumentSummaryVm {
  score: number;
}

export interface RestoreBlockInput {
  id: string;
  kind: BlockKind;
  content: string;
  language: string | null;
  position: number;
}

export function summarizeDocument(document: DocumentVm): DocumentSummaryVm {
  return {
    id: document.id,
    title: document.title,
    blockTintOverride: document.blockTintOverride,
    documentSurfaceToneOverride: document.documentSurfaceToneOverride,
    preview: document.blocks
      .map((block) => getBlockPlainText(block.kind, block.content))
      .find((text) => text.trim().length > 0) ?? '',
    updatedAt: document.updatedAt,
    lastOpenedAt: document.lastOpenedAt,
    blockCount: document.blocks.length,
  };
}

export function replaceBlockInDocument(document: DocumentVm, nextBlock: BlockVm): DocumentVm {
  const blocks = document.blocks
    .map((block) => (block.id === nextBlock.id ? nextBlock : block))
    .sort((left, right) => left.position - right.position);

  return {
    ...document,
    blocks,
  };
}

export function reorderDocumentBlocks(document: DocumentVm, blockId: string, targetPosition: number): DocumentVm {
  const sourceIndex = document.blocks.findIndex((block) => block.id === blockId);
  if (sourceIndex < 0 || sourceIndex === targetPosition) {
    return document;
  }

  const nextBlocks = [...document.blocks];
  const [moved] = nextBlocks.splice(sourceIndex, 1);
  nextBlocks.splice(targetPosition, 0, moved);

  return {
    ...document,
    blocks: nextBlocks.map((block, index) => ({
      ...block,
      position: index,
    })),
  };
}

export function touchDocument(document: DocumentVm, updatedAt: number): DocumentVm {
  return {
    ...document,
    updatedAt,
  };
}
