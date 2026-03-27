import { create } from 'zustand';
import type { AppUpdateStatus } from '../lib/types';

interface UpdaterState {
  appUpdateStatus: AppUpdateStatus;
  setAppUpdateStatus: (status: AppUpdateStatus) => void;
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  appUpdateStatus: { state: 'idle', version: null, percent: null, message: null, lastCheckedAt: null },
  setAppUpdateStatus: (appUpdateStatus) => set({ appUpdateStatus }),
}));
