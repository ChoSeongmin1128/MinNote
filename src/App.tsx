import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, LoaderCircle, PanelLeft } from 'lucide-react';
import { useDocumentController, useWorkspaceController } from './app/controllers';
import { AppUpdateButton } from './components/AppUpdateButton';
import { DocumentMenu } from './components/DocumentMenu';
import { Sidebar } from './components/Sidebar';
import { DocumentCanvas } from './components/DocumentCanvas';
import { SettingsModal } from './components/SettingsModal';
import { WindowMenu } from './components/WindowMenu';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useIsMobileViewport } from './hooks/useIsMobileViewport';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useDocumentSessionStore } from './stores/documentSessionStore';
import { useUiStore } from './stores/uiStore';
import { useUpdaterStore } from './stores/updaterStore';

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
  const { flushCurrentDocument } = useDocumentController();
  const { bootstrapApp, confirmAppShutdown } = useWorkspaceController();
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const isFlushing = useDocumentSessionStore((state) => state.isFlushing);
  const lastSavedAt = useDocumentSessionStore((state) => state.lastSavedAt);
  const isBootstrapping = useWorkspaceStore((state) => state.isBootstrapping);
  const appUpdateStatus = useUpdaterStore((state) => state.appUpdateStatus);
  const error = useWorkspaceStore((state) => state.error);
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const defaultDocumentSurfaceTonePreset = useWorkspaceStore((state) => state.defaultDocumentSurfaceTonePreset);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const setWorkspaceError = useWorkspaceStore((state) => state.setError);
  const desktopSidebarExpanded = useUiStore((state) => state.desktopSidebarExpanded);
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setDesktopSidebarExpanded = useUiStore((state) => state.setDesktopSidebarExpanded);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const isMobileViewport = useIsMobileViewport();

  useAppShortcuts();
  useAppUpdater(!isBootstrapping);

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
    let shuttingDown = false;

    const unlisten = listen('app-shutdown-requested', async () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      try {
        await flushCurrentDocument();
        await confirmAppShutdown();
      } catch (shutdownError) {
        const message =
          shutdownError instanceof Error
            ? shutdownError.message
            : '종료 전에 변경 내용을 저장하지 못했습니다.';
        setWorkspaceError(message);
      } finally {
        shuttingDown = false;
      }
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setWorkspaceError]);

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
          <div className="workspace-actions">
            <AppUpdateButton status={appUpdateStatus} />
            <WindowMenu />
            {currentDocument ? <DocumentMenu /> : null}
          </div>
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
