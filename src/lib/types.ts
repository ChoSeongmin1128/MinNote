export type BlockKind = 'markdown' | 'code' | 'text';
export type BlockCaretPlacement = 'start' | 'end';
export type BlockTintPreset =
  | 'mist'
  | 'sage-rose'
  | 'sky-amber'
  | 'mint-plum'
  | 'ocean-sand'
  | 'violet-lime';
export type DocumentSurfaceTonePreset =
  | 'default'
  | 'paper'
  | 'sand'
  | 'sage'
  | 'slate'
  | 'dusk';
export type ThemeMode = 'system' | 'light' | 'dark';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface BlockDto {
  id: string;
  documentId: string;
  kind: BlockKind;
  position: number;
  content: string;
  language: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSummaryDto {
  id: string;
  title: string | null;
  blockTintOverride: BlockTintPreset | null;
  documentSurfaceToneOverride: DocumentSurfaceTonePreset | null;
  preview: string;
  updatedAt: number;
  lastOpenedAt: number;
  blockCount: number;
}

export interface DocumentDto extends DocumentSummaryDto {
  blocks: BlockDto[];
}

export interface BootstrapPayload {
  documents: DocumentSummaryDto[];
  trashDocuments: DocumentSummaryDto[];
  currentDocument: DocumentDto | null;
  themeMode: ThemeMode;
  defaultBlockTintPreset: BlockTintPreset;
  defaultDocumentSurfaceTonePreset: DocumentSurfaceTonePreset;
  defaultBlockKind: BlockKind;
  icloudSyncEnabled: boolean;
  menuBarIconEnabled: boolean;
  alwaysOnTopEnabled: boolean;
  windowOpacityPercent: number;
  globalToggleShortcut: string | null;
}

export interface WindowControlRuntimeStateDto {
  globalShortcutError: string | null;
}

export interface SearchResultDto extends DocumentSummaryDto {
  score: number;
}

export interface BlockRestoreDto {
  id: string;
  kind: BlockKind;
  content: string;
  language: string | null;
  position: number;
}

export type ICloudSyncState = 'idle' | 'syncing' | 'error' | 'disabled';

export interface ICloudSyncStatus {
  state: ICloudSyncState;
  lastSyncAt: number | null;
  errorMessage: string | null;
}

// CloudKit에서 받은 원격 문서 (sidecar → frontend → Rust)
export interface RemoteDocumentDto {
  id: string;
  title: string | null;
  blockTintOverride: string | null;
  documentSurfaceToneOverride: string | null;
  blocksJson: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// sidecar → frontend 이벤트 메시지
export type SyncEventMessage =
  | { type: 'status'; state: string; lastSyncAt: number | null }
  | { type: 'remote-changed'; documents: RemoteDocumentDto[] }
  | { type: 'error'; message: string };
