import type {
  BlockKind,
  BlockTintPreset,
  DocumentSurfaceTonePreset,
  ICloudSyncStatus,
  ThemeMode,
} from '../../lib/types';
import type { DocumentSummaryVm, SearchResultVm } from '../models/document';

export interface WorkspaceGateway {
  setDocuments(documents: DocumentSummaryVm[]): void;
  setTrashDocuments(documents: DocumentSummaryVm[]): void;
  upsertDocumentSummary(document: DocumentSummaryVm): void;
  setSearchResults(results: SearchResultVm[]): void;
  setSearchQuery(query: string): void;
  setIsBootstrapping(value: boolean): void;
  clearError(): void;
  setError(message: string | null): void;
  setDefaultBlockTintPreset(preset: BlockTintPreset): void;
  setDefaultDocumentSurfaceTonePreset(preset: DocumentSurfaceTonePreset): void;
  setDefaultBlockKind(kind: BlockKind): void;
  setThemeMode(themeMode: ThemeMode): void;
  setIcloudSyncEnabled(value: boolean): void;
  getIcloudSyncStatus(): ICloudSyncStatus;
  setIcloudSyncStatus(status: ICloudSyncStatus): void;
  setMenuBarIconEnabled(value: boolean): void;
  setSettingsOpen(isOpen: boolean): void;
}
