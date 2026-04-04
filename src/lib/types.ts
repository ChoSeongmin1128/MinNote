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
export type BodyFontFamily = 'system-sans' | 'system-serif' | 'system-rounded';
export type CodeFontFamily = 'system-mono' | 'sf-mono' | 'menlo' | 'monaco';
export type ICloudSyncState = 'disabled' | 'checking' | 'syncing' | 'idle' | 'error';
export type ICloudAccountStatus =
  | 'unknown'
  | 'available'
  | 'no_account'
  | 'restricted'
  | 'temporarily_unavailable'
  | 'could_not_determine';

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
  icloudSyncStatus: ICloudSyncStatus;
  themeMode: ThemeMode;
  defaultBlockTintPreset: BlockTintPreset;
  defaultDocumentSurfaceTonePreset: DocumentSurfaceTonePreset;
  defaultBlockKind: BlockKind;
  bodyFontFamily: BodyFontFamily;
  bodyFontSizePx: number;
  codeFontFamily: CodeFontFamily;
  codeFontSizePx: number;
  menuBarIconEnabled: boolean;
  alwaysOnTopEnabled: boolean;
  windowOpacityPercent: number;
  globalToggleShortcut: string | null;
  globalShortcutError: string | null;
  menuBarIconError: string | null;
  windowPreferenceError: string | null;
}

export interface WindowControlRuntimeStateDto {
  globalShortcutError: string | null;
  menuBarIconError: string | null;
  windowPreferenceError: string | null;
}

export interface ICloudSyncStatus {
  enabled: boolean;
  state: ICloudSyncState;
  accountStatus: ICloudAccountStatus;
  lastSyncStartedAtMs: number | null;
  lastSyncSucceededAtMs: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface ICloudSyncDebugInfoDto {
  bridgeAvailable: boolean;
  bridgeError: string | null;
  zoneName: string;
  serverChangeTokenPresent: boolean;
  outboxCount: number;
  tombstoneCount: number;
  deviceIdSuffix: string;
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

export type AppUpdateState =
  | 'idle'
  | 'checking'
  | 'available_downloading'
  | 'ready_to_install'
  | 'installing'
  | 'error';

export interface AppUpdateStatus {
  state: AppUpdateState;
  version: string | null;
  percent: number | null;
  message: string | null;
  lastCheckedAt: number | null;
}
