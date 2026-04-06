import type { DocumentSummaryVm, SearchResultVm } from '../models/document';

export interface WorkspaceGateway {
  setDocuments(documents: DocumentSummaryVm[]): void;
  setTrashDocuments(documents: DocumentSummaryVm[]): void;
  setSyncNotice(message: string | null): void;
  upsertDocumentSummary(document: DocumentSummaryVm): void;
  setSearchResults(results: SearchResultVm[]): void;
  setSearchQuery(query: string): void;
  setIsBootstrapping(value: boolean): void;
  clearError(): void;
  setError(message: string | null): void;
}
