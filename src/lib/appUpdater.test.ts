import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate } from './appUpdater';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

describe('checkForUpdate', () => {
  it('maps latest.json 404 errors to a release metadata message', async () => {
    const statuses: string[] = [];
    const { check } = await import('@tauri-apps/plugin-updater');

    vi.mocked(check).mockRejectedValueOnce(new Error('HTTP 404 Not Found: latest.json'));

    await checkForUpdate((status) => {
      statuses.push(status.state === 'error' ? status.message : status.state);
    });

    expect(statuses).toContain('checking');
    expect(statuses).toContain('업데이트 메타데이터를 찾지 못했습니다. 릴리스에 latest.json이 업로드되어 있는지 확인해 주세요.');
  });
});
