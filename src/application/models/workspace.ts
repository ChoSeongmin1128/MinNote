import type {
  BlockKind,
  BlockTintPreset,
  BodyFontFamily,
  CodeFontFamily,
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
  bodyFontFamily: BodyFontFamily;
  bodyFontSizePx: number;
  codeFontFamily: CodeFontFamily;
  codeFontSizePx: number;
  menuBarIconEnabled: boolean;
  alwaysOnTopEnabled: boolean;
  windowOpacityPercent: number;
  globalToggleShortcut: string | null;
}

export interface WindowControlRuntimeState {
  globalShortcutError: string | null;
  menuBarIconError: string | null;
  windowPreferenceError: string | null;
}
