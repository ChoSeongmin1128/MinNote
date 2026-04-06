import {
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useDocumentController, useWorkspaceController } from '../app/controllers';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { SidebarDocumentList } from './sidebar/SidebarDocumentList';
import { SidebarRail } from './sidebar/SidebarRail';
import { SidebarTrashSection } from './sidebar/SidebarTrashSection';

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
  const { createDocument, emptyTrash, openDocument, restoreDocumentFromTrash } = useDocumentController();
  const { setSearchQuery } = useWorkspaceController();
  const documents = useWorkspaceStore((state) => state.documents);
  const trashDocuments = useWorkspaceStore((state) => state.trashDocuments);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const isTrashExpanded = useUiStore((state) => state.isTrashExpanded);
  const toggleTrashExpanded = useUiStore((state) => state.toggleTrashExpanded);
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
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

  const focusSearchInput = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  };

  const handleSearchTrigger = () => {
    if (isMobileViewport) {
      onOpenMobile();
      requestAnimationFrame(focusSearchInput);
      return;
    }

    onExpandDesktop();
    requestAnimationFrame(focusSearchInput);
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
          <SidebarRail
            isExpanded={isDesktopExpanded}
            onCollapse={onCollapseDesktop}
            onExpand={onExpandDesktop}
            onCreateDocument={() => void createDocument()}
            onSearchTrigger={handleSearchTrigger}
            onSettingsOpen={handleSettingsOpen}
          />
        ) : null}

        <div className="sidebar-panel" aria-hidden={!isPanelVisible}>
          <div className="sidebar-header">
            <div className="row sidebar-header-row">
              <button className="ghost-button sidebar-create-button" type="button" onClick={() => void createDocument()}>
                <Plus size={16} />
                새 문서
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
          </div>

          <SidebarDocumentList
            currentDocumentId={currentDocument?.id ?? null}
            documents={visibleDocuments}
            onOpenDocument={handleDocumentOpen}
          />

          <SidebarTrashSection
            documents={trashDocuments}
            isExpanded={isTrashExpanded}
            onToggleExpanded={toggleTrashExpanded}
            onEmptyTrash={() => void emptyTrash()}
            onRestoreDocument={(documentId) => void restoreDocumentFromTrash(documentId)}
          />

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
