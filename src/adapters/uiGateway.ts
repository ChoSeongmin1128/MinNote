import type { UiGateway } from '../application/ports/uiGateway';
import { useUiStore } from '../stores/uiStore';

export const uiGateway: UiGateway = {
  setSettingsOpen(isOpen) {
    useUiStore.getState().setSettingsOpen(isOpen);
  },
};
