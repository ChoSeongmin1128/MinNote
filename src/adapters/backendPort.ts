import type { BackendPort } from '../application/ports/backendPort';
import {
  mapBlockDtoToVm,
  mapBootstrapPayloadToState,
  mapDocumentDtoToVm,
  mapSearchResultDtoToVm,
  mapWindowControlRuntimeStateDto,
} from './backendMappers';
import { desktopApi } from '../lib/desktopApi';

export const backendPort: BackendPort = {
  async bootstrapApp() {
    return mapBootstrapPayloadToState(await desktopApi.bootstrapApp());
  },
  async getWindowControlRuntimeState() {
    return mapWindowControlRuntimeStateDto(await desktopApi.getWindowControlRuntimeState());
  },
  async searchDocuments(query) {
    return (await desktopApi.searchDocuments(query)).map(mapSearchResultDtoToVm);
  },
  async openDocument(documentId) {
    return mapDocumentDtoToVm(await desktopApi.openDocument(documentId));
  },
  async createDocument() {
    return mapDocumentDtoToVm(await desktopApi.createDocument());
  },
  async renameDocument(documentId, title) {
    return mapDocumentDtoToVm(await desktopApi.renameDocument(documentId, title));
  },
  async deleteDocument(documentId) {
    return mapBootstrapPayloadToState(await desktopApi.deleteDocument(documentId));
  },
  async deleteAllDocuments() {
    return mapBootstrapPayloadToState(await desktopApi.deleteAllDocuments());
  },
  async createBlockBelow(documentId, afterBlockId, kind) {
    return mapDocumentDtoToVm(await desktopApi.createBlockBelow(documentId, afterBlockId, kind));
  },
  async changeBlockKind(blockId, kind) {
    return mapBlockDtoToVm(await desktopApi.changeBlockKind(blockId, kind));
  },
  async moveBlock(documentId, blockId, targetPosition) {
    return mapDocumentDtoToVm(await desktopApi.moveBlock(documentId, blockId, targetPosition));
  },
  async deleteBlock(blockId) {
    return mapDocumentDtoToVm(await desktopApi.deleteBlock(blockId));
  },
  async updateMarkdownBlock(blockId, content) {
    return mapBlockDtoToVm(await desktopApi.updateMarkdownBlock(blockId, content));
  },
  async updateCodeBlock(blockId, content, language) {
    return mapBlockDtoToVm(await desktopApi.updateCodeBlock(blockId, content, language));
  },
  async updateTextBlock(blockId, content) {
    return mapBlockDtoToVm(await desktopApi.updateTextBlock(blockId, content));
  },
  flushDocument(documentId) {
    return desktopApi.flushDocument(documentId);
  },
  setThemeMode(themeMode) {
    return desktopApi.setThemeMode(themeMode);
  },
  setDefaultBlockTintPreset(preset) {
    return desktopApi.setDefaultBlockTintPreset(preset);
  },
  setDefaultDocumentSurfaceTonePreset(preset) {
    return desktopApi.setDefaultDocumentSurfaceTonePreset(preset);
  },
  async setDocumentBlockTintOverride(documentId, blockTintOverride) {
    return mapDocumentDtoToVm(
      await desktopApi.setDocumentBlockTintOverride(documentId, blockTintOverride),
    );
  },
  async setDocumentSurfaceToneOverride(documentId, documentSurfaceToneOverride) {
    return mapDocumentDtoToVm(
      await desktopApi.setDocumentSurfaceToneOverride(documentId, documentSurfaceToneOverride),
    );
  },
  async restoreDocumentBlocks(documentId, blocks) {
    return mapDocumentDtoToVm(await desktopApi.restoreDocumentBlocks(documentId, blocks));
  },
  emptyTrash() {
    return desktopApi.emptyTrash();
  },
  async restoreDocumentFromTrash(documentId) {
    return mapBootstrapPayloadToState(await desktopApi.restoreDocumentFromTrash(documentId));
  },
  setIcloudSyncEnabled(enabled) {
    return desktopApi.setIcloudSyncEnabled(enabled);
  },
  refreshIcloudSync() {
    return desktopApi.refreshIcloudSync();
  },
  confirmAppShutdown() {
    return desktopApi.confirmAppShutdown();
  },
  setMenuBarIconEnabled(enabled) {
    return desktopApi.setMenuBarIconEnabled(enabled);
  },
  setDefaultBlockKind(kind) {
    return desktopApi.setDefaultBlockKind(kind);
  },
  setAlwaysOnTopEnabled(enabled) {
    return desktopApi.setAlwaysOnTopEnabled(enabled);
  },
  previewWindowOpacityPercent(percent) {
    return desktopApi.previewWindowOpacityPercent(percent);
  },
  setWindowOpacityPercent(percent) {
    return desktopApi.setWindowOpacityPercent(percent);
  },
  setGlobalToggleShortcut(shortcut) {
    return desktopApi.setGlobalToggleShortcut(shortcut);
  },
  async applyRemoteDocuments(documents) {
    return mapBootstrapPayloadToState(await desktopApi.applyRemoteDocuments(documents));
  },
};
