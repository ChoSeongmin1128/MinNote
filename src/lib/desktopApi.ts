import { invoke } from '@tauri-apps/api/core';
import type {
  BlockDto,
  BlockKind,
  BlockRestoreDto,
  BlockTintPreset,
  BootstrapPayload,
  DocumentSurfaceTonePreset,
  DocumentDto,
  DocumentSummaryDto,
  RemoteDocumentDto,
  SearchResultDto,
  ThemeMode,
  WindowControlRuntimeStateDto,
} from './types';

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return 'MinNote backend와 통신하지 못했습니다. Tauri 환경에서 다시 실행해 주세요.';
}

async function call<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export const desktopApi = {
  bootstrapApp() {
    return call<BootstrapPayload>('bootstrap_app');
  },
  getWindowControlRuntimeState() {
    return call<WindowControlRuntimeStateDto>('get_window_control_runtime_state');
  },
  listDocuments() {
    return call<DocumentSummaryDto[]>('list_documents');
  },
  searchDocuments(query: string) {
    return call<SearchResultDto[]>('search_documents', { query });
  },
  openDocument(documentId: string) {
    return call<DocumentDto>('open_document', { documentId });
  },
  createDocument() {
    return call<DocumentDto>('create_document');
  },
  renameDocument(documentId: string, title: string | null) {
    return call<DocumentDto>('rename_document', { documentId, title });
  },
  deleteDocument(documentId: string) {
    return call<BootstrapPayload>('delete_document', { documentId });
  },
  deleteAllDocuments() {
    return call<BootstrapPayload>('delete_all_documents');
  },
  createBlockBelow(documentId: string, afterBlockId: string | null, kind: BlockKind = 'markdown') {
    return call<DocumentDto>('create_block_below', { documentId, afterBlockId, kind });
  },
  changeBlockKind(blockId: string, kind: BlockKind) {
    return call<BlockDto>('change_block_kind', { blockId, kind });
  },
  moveBlock(documentId: string, blockId: string, targetPosition: number) {
    return call<DocumentDto>('move_block', { documentId, blockId, targetPosition });
  },
  deleteBlock(blockId: string) {
    return call<DocumentDto>('delete_block', { blockId });
  },
  updateMarkdownBlock(blockId: string, content: string) {
    return call<BlockDto>('update_markdown_block', { blockId, content });
  },
  updateCodeBlock(blockId: string, content: string, language: string | null) {
    return call<BlockDto>('update_code_block', { blockId, content, language });
  },
  updateTextBlock(blockId: string, content: string) {
    return call<BlockDto>('update_text_block', { blockId, content });
  },
  flushDocument(documentId: string) {
    return call<number>('flush_document', { documentId });
  },
  setThemeMode(themeMode: ThemeMode) {
    return call<ThemeMode>('set_theme_mode', { themeMode });
  },
  setDefaultBlockTintPreset(preset: BlockTintPreset) {
    return call<BlockTintPreset>('set_default_block_tint_preset', { preset });
  },
  setDefaultDocumentSurfaceTonePreset(preset: DocumentSurfaceTonePreset) {
    return call<DocumentSurfaceTonePreset>('set_default_document_surface_tone_preset', { preset });
  },
  setDocumentBlockTintOverride(documentId: string, blockTintOverride: BlockTintPreset | null) {
    return call<DocumentDto>('set_document_block_tint_override', { documentId, blockTintOverride });
  },
  setDocumentSurfaceToneOverride(
    documentId: string,
    documentSurfaceToneOverride: DocumentSurfaceTonePreset | null,
  ) {
    return call<DocumentDto>('set_document_surface_tone_override', {
      documentId,
      documentSurfaceToneOverride,
    });
  },
  restoreDocumentBlocks(documentId: string, blocks: BlockRestoreDto[]) {
    return call<DocumentDto>('restore_document_blocks', { documentId, blocks });
  },
  emptyTrash() {
    return call<void>('empty_trash');
  },
  restoreDocumentFromTrash(documentId: string) {
    return call<BootstrapPayload>('restore_document_from_trash', { documentId });
  },
  setIcloudSyncEnabled(enabled: boolean) {
    return call<boolean>('set_icloud_sync_enabled', { enabled });
  },
  refreshIcloudSync() {
    return call<boolean>('refresh_icloud_sync');
  },
  confirmAppShutdown() {
    return call<void>('confirm_app_shutdown');
  },
  setMenuBarIconEnabled(enabled: boolean) {
    return call<boolean>('set_menu_bar_icon_enabled', { enabled });
  },
  setDefaultBlockKind(kind: BlockKind) {
    return call<BlockKind>('set_default_block_kind', { kind });
  },
  setAlwaysOnTopEnabled(enabled: boolean) {
    return call<boolean>('set_always_on_top_enabled', { enabled });
  },
  previewWindowOpacityPercent(percent: number) {
    return call<number>('preview_window_opacity_percent', { percent });
  },
  setWindowOpacityPercent(percent: number) {
    return call<number>('set_window_opacity_percent', { percent });
  },
  setGlobalToggleShortcut(shortcut: string | null) {
    return call<string | null>('set_global_toggle_shortcut', { shortcut });
  },
  applyRemoteDocuments(documents: RemoteDocumentDto[]) {
    return call<BootstrapPayload>('apply_remote_documents', { documents });
  },
};
