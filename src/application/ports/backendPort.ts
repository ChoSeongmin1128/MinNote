import type {
  BlockKind,
  BlockTintPreset,
  BodyFontFamily,
  CodeFontFamily,
  DocumentSurfaceTonePreset,
  ICloudSyncDebugInfoDto,
  ICloudSyncStatus,
  ThemeMode,
} from '../../lib/types';
import type { BlockVm, DocumentVm, RestoreBlockInput, SearchResultVm } from '../models/document';
import type { WindowControlRuntimeState, WorkspaceBootstrapState } from '../models/workspace';

export interface BackendPort {
  bootstrapApp(): Promise<WorkspaceBootstrapState>;
  getWindowControlRuntimeState(): Promise<WindowControlRuntimeState>;
  searchDocuments(query: string): Promise<SearchResultVm[]>;
  openDocument(documentId: string): Promise<DocumentVm>;
  createDocument(): Promise<DocumentVm>;
  renameDocument(documentId: string, title: string | null): Promise<DocumentVm>;
  deleteDocument(documentId: string): Promise<WorkspaceBootstrapState>;
  deleteAllDocuments(): Promise<WorkspaceBootstrapState>;
  createBlockBelow(documentId: string, afterBlockId: string | null, kind?: BlockKind): Promise<DocumentVm>;
  changeBlockKind(blockId: string, kind: BlockKind): Promise<BlockVm>;
  moveBlock(documentId: string, blockId: string, targetPosition: number): Promise<DocumentVm>;
  deleteBlock(blockId: string): Promise<DocumentVm>;
  updateMarkdownBlock(blockId: string, content: string): Promise<BlockVm>;
  updateCodeBlock(blockId: string, content: string, language: string | null): Promise<BlockVm>;
  updateTextBlock(blockId: string, content: string): Promise<BlockVm>;
  flushDocument(documentId: string): Promise<number>;
  setThemeMode(themeMode: ThemeMode): Promise<ThemeMode>;
  setDefaultBlockTintPreset(preset: BlockTintPreset): Promise<BlockTintPreset>;
  setDefaultDocumentSurfaceTonePreset(
    preset: DocumentSurfaceTonePreset,
  ): Promise<DocumentSurfaceTonePreset>;
  setBodyFontFamily(fontFamily: BodyFontFamily): Promise<BodyFontFamily>;
  setBodyFontSizePx(size: number): Promise<number>;
  setCodeFontFamily(fontFamily: CodeFontFamily): Promise<CodeFontFamily>;
  setCodeFontSizePx(size: number): Promise<number>;
  setDocumentBlockTintOverride(documentId: string, blockTintOverride: BlockTintPreset | null): Promise<DocumentVm>;
  setDocumentSurfaceToneOverride(
    documentId: string,
    documentSurfaceToneOverride: DocumentSurfaceTonePreset | null,
  ): Promise<DocumentVm>;
  restoreDocumentBlocks(documentId: string, blocks: RestoreBlockInput[]): Promise<DocumentVm>;
  emptyTrash(): Promise<void>;
  restoreDocumentFromTrash(documentId: string): Promise<WorkspaceBootstrapState>;
  confirmAppShutdown(): Promise<void>;
  getICloudSyncStatus(): Promise<ICloudSyncStatus>;
  getICloudSyncDebugInfo(): Promise<ICloudSyncDebugInfoDto>;
  setICloudSyncEnabled(enabled: boolean): Promise<ICloudSyncStatus>;
  runICloudSync(): Promise<ICloudSyncStatus>;
  resetICloudSyncCheckpoint(): Promise<ICloudSyncStatus>;
  forceUploadAllDocuments(): Promise<ICloudSyncStatus>;
  forceRedownloadFromCloud(): Promise<ICloudSyncStatus>;
  setMenuBarIconEnabled(enabled: boolean): Promise<boolean>;
  setDefaultBlockKind(kind: BlockKind): Promise<BlockKind>;
  setAlwaysOnTopEnabled(enabled: boolean): Promise<boolean>;
  previewWindowOpacityPercent(percent: number): Promise<number>;
  setWindowOpacityPercent(percent: number): Promise<number>;
  setGlobalToggleShortcut(shortcut: string | null): Promise<string | null>;
}
