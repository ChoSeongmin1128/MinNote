import type { AppUpdateStatus } from '../../lib/types';

export interface UpdaterGateway {
  getStatus(): AppUpdateStatus;
  setStatus(status: AppUpdateStatus): void;
}
