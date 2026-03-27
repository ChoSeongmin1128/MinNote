import type { UpdaterGateway } from '../application/ports/updaterGateway';
import { useUpdaterStore } from '../stores/updaterStore';

export const updaterGateway: UpdaterGateway = {
  getStatus() {
    return useUpdaterStore.getState().appUpdateStatus;
  },
  setStatus(status) {
    useUpdaterStore.getState().setAppUpdateStatus(status);
  },
};
