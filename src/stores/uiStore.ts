import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  isSettingsOpen: boolean;
  desktopSidebarExpanded: boolean;
  mobileSidebarOpen: boolean;
  isTrashExpanded: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  setDesktopSidebarExpanded: (isExpanded: boolean) => void;
  setMobileSidebarOpen: (isOpen: boolean) => void;
  setTrashExpanded: (isExpanded: boolean) => void;
  toggleTrashExpanded: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSettingsOpen: false,
      desktopSidebarExpanded: true,
      mobileSidebarOpen: false,
      isTrashExpanded: false,
      setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      setDesktopSidebarExpanded: (desktopSidebarExpanded) => set({ desktopSidebarExpanded }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setTrashExpanded: (isTrashExpanded) => set({ isTrashExpanded }),
      toggleTrashExpanded: () => set((state) => ({ isTrashExpanded: !state.isTrashExpanded })),
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
