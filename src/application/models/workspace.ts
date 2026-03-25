import type {
  BlockKind,
  BlockTintPreset,
  DocumentSurfaceTonePreset,
  ThemeMode,
} from '../../lib/types';
import type { DocumentSummaryVm, DocumentVm } from './document';

export interface WorkspaceBootstrapState {
  documents: DocumentSummaryVm[];
  trashDocuments: DocumentSummaryVm[];
  currentDocument: DocumentVm | null;
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

export interface WindowControlRuntimeState {
  globalShortcutError: string | null;
}
