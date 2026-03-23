import { FileSearch, Plus, Search, Settings2, X } from 'lucide-react';
import { useMemo } from 'react';
import { SidebarDocumentMenu } from './SidebarDocumentMenu';
import { createDocument, openDocument, setSearchQuery } from '../controllers/appController';
import { getVisibleDocumentTitle } from '../lib/documentTitle';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const documents = useWorkspaceStore((state) => state.documents);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const setSettingsOpen = useWorkspaceStore((state) => state.setSettingsOpen);

  const visibleDocuments = useMemo(
    () => (searchQuery.trim() ? searchResults : documents),
    [documents, searchQuery, searchResults],
  );

  return (
    <>
      {isOpen ? <button className="sidebar-backdrop" type="button" aria-label="사이드바 닫기" onClick={onClose} /> : null}
      <aside className={`sidebar${isOpen ? ' is-open' : ''}`}>
      <div className="sidebar-header">
        <div className="brand">
          <span className="brand-title">MinNote</span>
        </div>
        <div className="row">
          <button className="icon-button" type="button" onClick={() => void createDocument()} aria-label="새 문서 만들기">
            <Plus size={16} />
          </button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="사이드바 닫기">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="search-shell">
        <div className="search-row">
          <Search size={14} className="search-icon" />
          <input
            id="document-search"
            className="search-input"
            placeholder="검색"
            value={searchQuery}
            onChange={(event) => void setSearchQuery(event.target.value)}
          />
        </div>
        <span className="search-meta">
          {searchQuery.trim() ? `${searchResults.length}개 결과` : `${documents.length}개 문서`}
        </span>
      </div>

      <div className="document-list">
        {visibleDocuments.length === 0 ? (
          <div className="empty-state">
            <FileSearch />
            <p>검색 결과가 없습니다.</p>
          </div>
        ) : (
          visibleDocuments.map((document) => (
            <div
              key={document.id}
              className={`document-card${currentDocument?.id === document.id ? ' is-active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                void openDocument(document.id);
                onClose();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  void openDocument(document.id);
                  onClose();
                }
              }}
            >
              <div className="document-card-header">
                <span className="document-card-title">{getVisibleDocumentTitle(document.title)}</span>
                <SidebarDocumentMenu documentId={document.id} />
              </div>
              <div className="document-card-sub">
                <span className="document-meta">{formatTimestamp(document.updatedAt)}</span>
                <span className="document-preview">{document.preview || ''}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className="ghost-button sidebar-settings-button"
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            onClose();
          }}
        >
          <Settings2 size={16} />
          설정
        </button>
      </div>
      </aside>
    </>
  );
}
