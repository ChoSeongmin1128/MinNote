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
  getSelectionState(): SessionSelectionState;
  setCurrentDocument(document: DocumentVm | null): void;
  setCurrentDocumentState(document: DocumentVm): void;
  setDocumentWithFocus(document: DocumentVm, focusBlockId: string | null, caret?: BlockCaretPlacement): void;
  clearBlockSelection(clearActiveEditorRef?: boolean): void;
  requestBlockFocus(blockId: string, caret: BlockCaretPlacement): void;
  clearActiveEditorRef(): void;
  setIsFlushing(value: boolean): void;
  markLocalMutation(value?: number): void;
}
