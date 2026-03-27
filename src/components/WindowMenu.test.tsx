import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowMenu } from './WindowMenu';
import { useWorkspaceStore } from '../stores/workspaceStore';

const actions = vi.hoisted(() => ({
  setAlwaysOnTopEnabled: vi.fn(),
  previewWindowOpacityPercent: vi.fn(),
  setWindowOpacityPercent: vi.fn(),
}));

vi.mock('../app/controllers', () => ({
  usePreferencesController: () => ({
    setAlwaysOnTopEnabled: actions.setAlwaysOnTopEnabled,
    previewWindowOpacityPercent: actions.previewWindowOpacityPercent,
    setWindowOpacityPercent: actions.setWindowOpacityPercent,
  }),
}));

describe('WindowMenu', () => {
  beforeEach(() => {
    actions.setAlwaysOnTopEnabled.mockReset();
    actions.previewWindowOpacityPercent.mockReset();
    actions.setWindowOpacityPercent.mockReset();
    actions.previewWindowOpacityPercent.mockImplementation(async (value: number) => value);
    actions.setWindowOpacityPercent.mockImplementation(async (value: number) => value);
    useWorkspaceStore.setState({
      alwaysOnTopEnabled: false,
      windowOpacityPercent: 100,
    });
  });

  it('renders quick app window controls and dispatches changes', async () => {
    render(<WindowMenu />);

    await userEvent.click(screen.getByRole('button', { name: '앱 창 메뉴' }));

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(actions.setAlwaysOnTopEnabled).toHaveBeenCalledWith(true);

    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '82' } });
    expect(actions.previewWindowOpacityPercent).toHaveBeenCalledWith(82);
    fireEvent.pointerUp(slider, { target: { value: '82' } });
    expect(actions.setWindowOpacityPercent).toHaveBeenCalledWith(82);
    useWorkspaceStore.setState({ windowOpacityPercent: 82 });

    await userEvent.click(screen.getByRole('button', { name: '100%로 복원' }));
    expect(actions.setWindowOpacityPercent).toHaveBeenCalledWith(100);
  });
});
