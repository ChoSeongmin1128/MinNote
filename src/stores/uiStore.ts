import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  isSettingsOpen: boolean;
  desktopSidebarExpanded: boolean;
  mobileSidebarOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  setDesktopSidebarExpanded: (isExpanded: boolean) => void;
  setMobileSidebarOpen: (isOpen: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSettingsOpen: false,
      desktopSidebarExpanded: true,
      mobileSidebarOpen: false,
      setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      setDesktopSidebarExpanded: (desktopSidebarExpanded) => set({ desktopSidebarExpanded }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    }),
    {
      name: 'workspace-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        desktopSidebarExpanded: state.desktopSidebarExpanded,
      }),
    },
  ),
);
