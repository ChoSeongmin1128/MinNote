import type { WindowControlRuntimeState, WorkspaceBootstrapState } from '../application/models/workspace';
import type {
  BlockVm,
  DocumentSummaryVm,
  DocumentVm,
  SearchResultVm,
} from '../application/models/document';
import { normalizeCodeLanguage } from '../lib/codeLanguageRegistry';
import type {
  BlockDto,
  BootstrapPayload,
  DocumentDto,
  DocumentSummaryDto,
  SearchResultDto,
  WindowControlRuntimeStateDto,
} from '../lib/types';

export function mapBlockDtoToVm(block: BlockDto): BlockVm {
  const base = {
    id: block.id,
    documentId: block.documentId,
    kind: block.kind,
    position: block.position,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  } as const;

  if (block.kind === 'markdown') {
    return {
      ...base,
      kind: 'markdown',
      content: block.content,
      language: null,
    };
  }

  if (block.kind === 'code') {
    return {
      ...base,
      kind: 'code',
      content: typeof block.content === 'string' ? block.content : '',
      language: normalizeCodeLanguage(block.language),
    };
  }

  return {
    ...base,
    kind: 'text',
    content: typeof block.content === 'string' ? block.content : '',
    language: null,
  };
}

export function mapDocumentSummaryDtoToVm(document: DocumentSummaryDto): DocumentSummaryVm {
  return {
    id: document.id,
    title: document.title,
    blockTintOverride: document.blockTintOverride,
    documentSurfaceToneOverride: document.documentSurfaceToneOverride,
    preview: document.preview,
    updatedAt: document.updatedAt,
    lastOpenedAt: document.lastOpenedAt,
    blockCount: document.blockCount,
  };
}

export function mapDocumentDtoToVm(document: DocumentDto): DocumentVm {
  const blocks = document.blocks
    .map(mapBlockDtoToVm)
    .sort((left, right) => left.position - right.position);

  return {
    ...mapDocumentSummaryDtoToVm(document),
    blocks,
  };
}

export function mapSearchResultDtoToVm(result: SearchResultDto): SearchResultVm {
  return {
    ...mapDocumentSummaryDtoToVm(result),
    score: result.score,
  };
}

export function mapBootstrapPayloadToState(payload: BootstrapPayload): WorkspaceBootstrapState {
  return {
    documents: payload.documents.map(mapDocumentSummaryDtoToVm),
    trashDocuments: payload.trashDocuments.map(mapDocumentSummaryDtoToVm),
    currentDocument: payload.currentDocument ? mapDocumentDtoToVm(payload.currentDocument) : null,
    icloudSyncStatus: payload.icloudSyncStatus,
    themeMode: payload.themeMode,
    defaultBlockTintPreset: payload.defaultBlockTintPreset,
    defaultDocumentSurfaceTonePreset: payload.defaultDocumentSurfaceTonePreset,
    defaultBlockKind: payload.defaultBlockKind,
    bodyFontFamily: payload.bodyFontFamily,
    bodyFontSizePx: payload.bodyFontSizePx,
    codeFontFamily: payload.codeFontFamily,
    codeFontSizePx: payload.codeFontSizePx,
    menuBarIconEnabled: payload.menuBarIconEnabled,
    alwaysOnTopEnabled: payload.alwaysOnTopEnabled,
    windowOpacityPercent: payload.windowOpacityPercent,
    globalToggleShortcut: payload.globalToggleShortcut,
    globalShortcutError: payload.globalShortcutError,
    menuBarIconError: payload.menuBarIconError,
    windowPreferenceError: payload.windowPreferenceError,
  };
}

export function mapWindowControlRuntimeStateDto(
  payload: WindowControlRuntimeStateDto,
): WindowControlRuntimeState {
  return {
    globalShortcutError: payload.globalShortcutError,
    menuBarIconError: payload.menuBarIconError,
    windowPreferenceError: payload.windowPreferenceError,
  };
}
