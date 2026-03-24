import {
  ChevronsLeft,
  ChevronsRight,
  FileSearch,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDocument,
  emptyTrash,
  openDocument,
  restoreDocumentFromTrash,
  setSearchQuery,
} from '../app/actions';
import { getVisibleDocumentTitle } from '../lib/documentTitle';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { SidebarDocumentMenu } from './SidebarDocumentMenu';

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

interface SidebarProps {
  isMobileViewport: boolean;
  desktopSidebarExpanded: boolean;
  mobileSidebarOpen: boolean;
  onExpandDesktop: () => void;
  onCollapseDesktop: () => void;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
}

export function Sidebar({
  isMobileViewport,
  desktopSidebarExpanded,
  mobileSidebarOpen,
  onExpandDesktop,
  onCollapseDesktop,
  onOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const documents = useWorkspaceStore((state) => state.documents);
  const trashDocuments = useWorkspaceStore((state) => state.trashDocuments);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const setSettingsOpen = useWorkspaceStore((state) => state.setSettingsOpen);
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [shouldFocusSearch, setShouldFocusSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isDesktopExpanded = desktopSidebarExpanded;
  const isPanelVisible = isMobileViewport ? mobileSidebarOpen : isDesktopExpanded;
  const asideMode = isMobileViewport
    ? (mobileSidebarOpen ? 'mobile-open' : 'mobile-closed')
    : (isDesktopExpanded ? 'desktop-expanded' : 'desktop-collapsed');

  const visibleDocuments = useMemo(
    () => (searchQuery.trim() ? searchResults : documents),
    [documents, searchQuery, searchResults],
  );

  useEffect(() => {
    if (!isPanelVisible || !shouldFocusSearch) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    setShouldFocusSearch(false);
  }, [isPanelVisible, shouldFocusSearch]);

  const handleSearchTrigger = () => {
    setShouldFocusSearch(true);
    if (isMobileViewport) {
      onOpenMobile();
      return;
    }

    onExpandDesktop();
  };

  const handleDocumentOpen = (documentId: string) => {
    void openDocument(documentId);
    if (isMobileViewport) {
      onCloseMobile();
    }
  };

  const handleSettingsOpen = () => {
    setSettingsOpen(true);
    if (isMobileViewport) {
      onCloseMobile();
    }
  };

  return (
    <>
      {isMobileViewport && mobileSidebarOpen ? (
        <button className="sidebar-backdrop" type="button" aria-label="사이드바 닫기" onClick={onCloseMobile} />
      ) : null}
      <aside className={`sidebar sidebar-${asideMode}`} aria-label="문서 사이드바">
        {!isMobileViewport ? (
          <div className="sidebar-rail" aria-label="사이드바 레일">
            <button
              className="sidebar-rail-button"
              type="button"
              aria-label={isDesktopExpanded ? '사이드바 접기' : '사이드바 펼치기'}
              onClick={isDesktopExpanded ? onCollapseDesktop : onExpandDesktop}
            >
              {isDesktopExpanded ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
            </button>
            <button
              className="sidebar-rail-button"
              type="button"
              aria-label="새 문서 만들기"
              onClick={() => void createDocument()}
            >
              <Plus size={16} />
            </button>
            <button
              className="sidebar-rail-button"
              type="button"
              aria-label="검색 열기"
              onClick={handleSearchTrigger}
            >
              <Search size={16} />
            </button>
            <button
              className="sidebar-rail-button sidebar-rail-footer-button"
              type="button"
              aria-label="설정 열기"
              onClick={handleSettingsOpen}
            >
              <Settings2 size={16} />
            </button>
          </div>
        ) : null}

        <div className="sidebar-panel" aria-hidden={!isPanelVisible}>
          <div className="sidebar-header">
            <div className="brand">
              <span className="brand-title">MinNote</span>
            </div>
            <div className="row">
              <button className="icon-button" type="button" onClick={() => void createDocument()} aria-label="새 문서 만들기">
                <Plus size={16} />
              </button>
              {isMobileViewport ? (
                <button className="icon-button sidebar-close-button" type="button" onClick={onCloseMobile} aria-label="사이드바 닫기">
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="search-shell">
            <div className="search-row">
              <Search size={14} className="search-icon" />
              <input
                ref={searchInputRef}
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
                    handleDocumentOpen(document.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleDocumentOpen(document.id);
                    }
                  }}
                >
                  <div className="document-card-header">
                    <span className="document-card-title">{getVisibleDocumentTitle(document.title)}</span>
                  </div>
                  <div className="document-card-sub">
                    <span className="document-meta">{formatTimestamp(document.updatedAt)}</span>
                    <span className="document-preview">{document.preview || ''}</span>
                  </div>
                  <SidebarDocumentMenu documentId={document.id} />
                </div>
              ))
            )}
          </div>

          {trashDocuments.length > 0 ? (
            <div className="trash-section">
              <div className="trash-section-header">
                <Trash2 size={12} />
                <span>휴지통</span>
              </div>
              {trashDocuments.map((document) => (
                <div key={document.id} className="trash-card">
                  <div className="trash-card-info">
                    <span className="trash-card-title">{getVisibleDocumentTitle(document.title)}</span>
                  </div>
                  <button
                    className="icon-button trash-restore-button"
                    type="button"
                    aria-label="복원"
                    onClick={() => void restoreDocumentFromTrash(document.id)}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              ))}
              <div className="trash-empty-row">
                {confirmEmptyTrash ? (
                  <>
                    <span className="trash-empty-confirm-label">정말 비울까요?</span>
                    <button
                      className="ghost-button trash-empty-cancel"
                      type="button"
                      onClick={() => setConfirmEmptyTrash(false)}
                    >
                      취소
                    </button>
                    <button
                      className="ghost-button trash-empty-confirm"
                      type="button"
                      onClick={() => {
                        setConfirmEmptyTrash(false);
                        void emptyTrash();
                      }}
                    >
                      비우기
                    </button>
                  </>
                ) : (
                  <button
                    className="ghost-button trash-empty-button"
                    type="button"
                    onClick={() => setConfirmEmptyTrash(true)}
                  >
                    휴지통 비우기
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div className="sidebar-footer">
            <button className="ghost-button sidebar-settings-button" type="button" onClick={handleSettingsOpen}>
              <Settings2 size={16} />
              설정
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
