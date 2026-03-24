import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, LoaderCircle, PanelLeft } from 'lucide-react';
import { bootstrapApp } from './app/actions';
import { DocumentMenu } from './components/DocumentMenu';
import { Sidebar } from './components/Sidebar';
import { DocumentCanvas } from './components/DocumentCanvas';
import { SettingsModal } from './components/SettingsModal';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useIsMobileViewport } from './hooks/useIsMobileViewport';
import { useSyncEventListener } from './hooks/useSyncEventListener';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useDocumentSessionStore } from './stores/documentSessionStore';

function formatLastSavedAt(value: number) {
  const date = new Date(value);
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];

  return `${parts.join('.')}. ${time.join(':')}`;
}

function App() {
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const isFlushing = useDocumentSessionStore((state) => state.isFlushing);
  const lastSavedAt = useDocumentSessionStore((state) => state.lastSavedAt);
  const isBootstrapping = useWorkspaceStore((state) => state.isBootstrapping);
  const error = useWorkspaceStore((state) => state.error);
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const defaultDocumentSurfaceTonePreset = useWorkspaceStore((state) => state.defaultDocumentSurfaceTonePreset);
  const isSettingsOpen = useWorkspaceStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useWorkspaceStore((state) => state.setSettingsOpen);
  const desktopSidebarExpanded = useWorkspaceStore((state) => state.desktopSidebarExpanded);
  const mobileSidebarOpen = useWorkspaceStore((state) => state.mobileSidebarOpen);
  const setDesktopSidebarExpanded = useWorkspaceStore((state) => state.setDesktopSidebarExpanded);
  const setMobileSidebarOpen = useWorkspaceStore((state) => state.setMobileSidebarOpen);
  const isMobileViewport = useIsMobileViewport();

  useAppShortcuts();
  useSyncEventListener();

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    const unlisten = listen('tray-open-settings', () => {
      setSettingsOpen(true);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setSettingsOpen]);

  useEffect(() => {
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.style.colorScheme = themeMode === 'system' ? 'light dark' : themeMode;
  }, [themeMode]);

  const appSurfaceTone =
    currentDocument?.documentSurfaceToneOverride ?? defaultDocumentSurfaceTonePreset;

  return (
    <div className="app-shell" data-surface-tone={appSurfaceTone}>
      <Sidebar
        isMobileViewport={isMobileViewport}
        desktopSidebarExpanded={desktopSidebarExpanded}
        mobileSidebarOpen={mobileSidebarOpen}
        onExpandDesktop={() => setDesktopSidebarExpanded(true)}
        onCollapseDesktop={() => setDesktopSidebarExpanded(false)}
        onOpenMobile={() => setMobileSidebarOpen(true)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
      <main className="workspace">
        <header className="workspace-header">
          {isMobileViewport ? (
            <button className="icon-button" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="사이드바 열기">
              <PanelLeft size={16} />
            </button>
          ) : null}
          <div className="workspace-heading">
            {currentDocument ? (
              <span className="workspace-status">
                {isFlushing ? '저장 중…' : lastSavedAt ? `마지막 저장 ${formatLastSavedAt(lastSavedAt)}` : ''}
              </span>
            ) : null}
          </div>
          {currentDocument ? <DocumentMenu /> : null}
        </header>

        {isBootstrapping ? (
          <section className="empty-state">
            <LoaderCircle className="spin" />
            <p>문서를 불러오는 중입니다.</p>
          </section>
        ) : error ? (
          <section className="empty-state error-state">
            <AlertCircle />
            <p>{error}</p>
          </section>
        ) : (
          <DocumentCanvas />
        )}
      </main>
    </div>
  );
}

export default App;
