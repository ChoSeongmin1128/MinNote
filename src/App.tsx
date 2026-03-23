import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertCircle, LoaderCircle, PanelLeft, Plus } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { DocumentCanvas } from './components/DocumentCanvas';
import { SettingsModal } from './components/SettingsModal';
import { bootstrapApp, createDocument } from './controllers/appController';
import { useAppShortcuts } from './hooks/useAppShortcuts';
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
  const isSettingsOpen = useWorkspaceStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useWorkspaceStore((state) => state.setSettingsOpen);
  const isSidebarOpen = useWorkspaceStore((state) => state.isSidebarOpen);
  const setSidebarOpen = useWorkspaceStore((state) => state.setSidebarOpen);

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

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
      <main className="workspace">
        <header className="workspace-header">
          <button className="icon-button" type="button" onClick={() => setSidebarOpen(!isSidebarOpen)} aria-label="사이드바 토글">
            <PanelLeft size={16} />
          </button>
          <div className="workspace-heading">
            {currentDocument ? (
              <span className="workspace-status">
                {isFlushing ? '저장 중…' : lastSavedAt ? `마지막 저장 ${formatLastSavedAt(lastSavedAt)}` : ''}
              </span>
            ) : null}
          </div>
          <button className="ghost-button" type="button" onClick={() => void createDocument()}>
            <Plus size={16} />
            새 문서
          </button>
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
