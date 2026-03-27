export type PendingBlockSave =
  | { kind: 'markdown'; content: string }
  | { kind: 'code'; content: string; language: string | null }
  | { kind: 'text'; content: string };

export interface EditorPersistenceErrorContext {
  documentId: string;
  blockId: string;
  phase: 'autosave' | 'flush';
}

export interface EditorPersistencePort {
  queueBlockSave(documentId: string, blockId: string, save: PendingBlockSave): void;
  flushDocument(documentId: string): Promise<number | null>;
  clearDocument(documentId: string): void;
  clearAll(): void;
  clearBlock(documentId: string, blockId: string): void;
  setErrorHandler(handler: ((error: unknown, context: EditorPersistenceErrorContext) => void) | null): void;
}
