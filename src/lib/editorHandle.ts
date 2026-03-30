export interface BlockEditorHandle {
  cut: () => Promise<boolean>;
  copy: () => Promise<boolean>;
  paste: () => Promise<boolean>;
  pastePlainText: () => Promise<boolean>;
  selectAll: () => boolean;
  canUndo: () => boolean;
  undo: () => void;
  canRedo: () => boolean;
  redo: () => void;
}
