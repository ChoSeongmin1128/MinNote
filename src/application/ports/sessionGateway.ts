import type { BlockCaretPlacement } from '../../lib/types';
import type { DocumentVm } from '../models/document';

export interface SessionSelectionState {
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  blockSelected: boolean;
  allBlocksSelected: boolean;
}

export interface SessionGateway {
  getCurrentDocument(): DocumentVm | null;
  hasUnsavedLocalChanges(): boolean;
  getSelectionState(): SessionSelectionState;
  setCurrentDocument(document: DocumentVm | null): void;
  setCurrentDocumentState(document: DocumentVm): void;
  setDocumentWithFocus(document: DocumentVm, focusBlockId: string | null, caret?: BlockCaretPlacement): void;
  clearBlockSelection(clearActiveEditorRef?: boolean): void;
  requestBlockFocus(blockId: string, caret: BlockCaretPlacement): void;
  clearActiveEditorRef(): void;
  setIsFlushing(value: boolean): void;
  startSaving(): void;
  finishSaving(): void;
  setLastSavedAt(value: number | null): void;
  setSaveError(value: string | null): void;
  markLocalMutation(value?: number): void;
  markTextMutation(value?: number): void;
  markStructuralMutation(value?: number): void;
}
