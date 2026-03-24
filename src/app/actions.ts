import { appUseCases } from './runtime';

export const flushCurrentDocument = appUseCases.flushCurrentDocument;
export const createDocument = appUseCases.createDocument;
export const openDocument = appUseCases.openDocument;
export const commitDocumentTitle = appUseCases.commitDocumentTitle;
export const deleteDocument = appUseCases.deleteDocument;
export const emptyTrash = appUseCases.emptyTrash;
export const restoreDocumentFromTrash = appUseCases.restoreDocumentFromTrash;
export const setDocumentBlockTintOverride = appUseCases.setDocumentBlockTintOverride;
export const setDocumentSurfaceToneOverride = appUseCases.setDocumentSurfaceToneOverride;

export const createBlockBelow = appUseCases.createBlockBelow;
export const changeBlockKind = appUseCases.changeBlockKind;
export const moveBlock = appUseCases.moveBlock;
export const deleteBlock = appUseCases.deleteBlock;
export const updateMarkdownBlock = appUseCases.updateMarkdownBlock;
export const updateCodeBlock = appUseCases.updateCodeBlock;
export const updateTextBlock = appUseCases.updateTextBlock;
export const isBlockClipboardText = appUseCases.isBlockClipboardText;
export const copySelectedBlocks = appUseCases.copySelectedBlocks;
export const copySingleBlock = appUseCases.copySingleBlock;
export const pasteBlocks = appUseCases.pasteBlocks;
export const deleteSelectedBlocks = appUseCases.deleteSelectedBlocks;
export const undoBlockOperation = appUseCases.undoBlockOperation;
export const redoBlockOperation = appUseCases.redoBlockOperation;

export const bootstrapApp = appUseCases.bootstrapApp;
export const setSearchQuery = appUseCases.setSearchQuery;
export const setThemeMode = appUseCases.setThemeMode;
export const setDefaultBlockTintPreset = appUseCases.setDefaultBlockTintPreset;
export const setDefaultDocumentSurfaceTonePreset = appUseCases.setDefaultDocumentSurfaceTonePreset;
export const setDefaultBlockKind = appUseCases.setDefaultBlockKind;
export const setIcloudSyncEnabled = appUseCases.setIcloudSyncEnabled;
export const setMenuBarIconEnabled = appUseCases.setMenuBarIconEnabled;
export const deleteAllDocuments = appUseCases.deleteAllDocuments;
