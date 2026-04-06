import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentSessionStore } from '../stores/documentSessionStore';

const controllerMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  emptyTrash: vi.fn(),
  openDocument: vi.fn(),
  restoreDocumentFromTrash: vi.fn(),
  setSearchQuery: vi.fn(),
}));

vi.mock('../app/controllers', () => ({
  useDocumentController: () => ({
    createDocument: controllerMocks.createDocument,
    emptyTrash: controllerMocks.emptyTrash,
    openDocument: controllerMocks.openDocument,
    restoreDocumentFromTrash: controllerMocks.restoreDocumentFromTrash,
  }),
  useWorkspaceController: () => ({
    setSearchQuery: controllerMocks.setSearchQuery,
  }),
}));

function renderSidebar(props?: Partial<ComponentProps<typeof Sidebar>>) {
  return render(
    <Sidebar
      isMobileViewport={false}
      desktopSidebarExpanded
      mobileSidebarOpen={false}
      onExpandDesktop={vi.fn()}
      onCollapseDesktop={vi.fn()}
      onOpenMobile={vi.fn()}
      onCloseMobile={vi.fn()}
      {...props}
    />,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      documents: [
        {
          id: 'doc-1',
          title: '첫 문서',
          blockTintOverride: null,
          documentSurfaceToneOverride: null,
          preview: '미리보기',
          updatedAt: Date.now(),
          lastOpenedAt: Date.now(),
          blockCount: 1,
        },
      ],
      trashDocuments: [],
      searchResults: [],
      searchQuery: '',
    });
    useUiStore.setState({
      isSettingsOpen: false,
      isTrashExpanded: false,
      desktopSidebarExpanded: true,
      mobileSidebarOpen: false,
    });

    useDocumentSessionStore.setState({
      currentDocument: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows backdrop only on mobile overlay', () => {
    const { container, rerender } = renderSidebar({
      isMobileViewport: true,
      mobileSidebarOpen: false,
    });

    expect(container.querySelector('.sidebar-backdrop')).not.toBeInTheDocument();

    rerender(
      <Sidebar
        isMobileViewport
        desktopSidebarExpanded
        mobileSidebarOpen
        onExpandDesktop={vi.fn()}
        onCollapseDesktop={vi.fn()}
        onOpenMobile={vi.fn()}
        onCloseMobile={vi.fn()}
      />,
    );

    expect(container.querySelector('.sidebar-backdrop')).toBeInTheDocument();
  });

  it('closes mobile sidebar after selecting a document', async () => {
    const onCloseMobile = vi.fn();

    renderSidebar({
      isMobileViewport: true,
      mobileSidebarOpen: true,
      onCloseMobile,
    });

    await userEvent.click(screen.getByRole('button', { name: /첫 문서/ }));

    expect(onCloseMobile).toHaveBeenCalled();
  });

  it('does not close desktop sidebar after selecting a document', async () => {
    const onCloseMobile = vi.fn();

    renderSidebar({
      isMobileViewport: false,
      onCloseMobile,
    });

    await userEvent.click(screen.getByRole('button', { name: /첫 문서/ }));

    expect(onCloseMobile).not.toHaveBeenCalled();
  });

  it('shows icon rail when desktop sidebar is collapsed', () => {
    renderSidebar({
      desktopSidebarExpanded: false,
    });

    expect(screen.getByLabelText('사이드바 레일')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  it('shows trash as a collapsed summary until expanded', async () => {
    useWorkspaceStore.setState({
      trashDocuments: [
        {
          id: 'trash-1',
          title: '버린 문서',
          blockTintOverride: null,
          documentSurfaceToneOverride: null,
          preview: '',
          updatedAt: Date.now(),
          lastOpenedAt: Date.now(),
          blockCount: 1,
        },
      ],
    });
    useUiStore.setState({ isTrashExpanded: false });

    renderSidebar();

    expect(screen.getByRole('button', { name: /휴지통/i })).toBeInTheDocument();
    expect(screen.queryByText('버린 문서')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /휴지통/i }));

    expect(screen.getByText('버린 문서')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '복원' })).toBeInTheDocument();
  });

  it('keeps the trash summary visible when empty', async () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: /휴지통/i })).toBeInTheDocument();
    expect(screen.getByText('비어 있음')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /휴지통/i }));

    expect(screen.getByText('삭제된 문서가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /휴지통 비우기/i })).not.toBeInTheDocument();
  });
});
