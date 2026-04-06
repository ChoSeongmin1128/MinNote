import { describe, expect, it } from 'vitest';
import {
  deriveCloudSyncIndicatorStatus,
  deriveEditorSaveStatus,
  deriveEditorStatusPresentation,
} from './editorStatus';
import type { ICloudSyncStatus } from '../../lib/types';

function createSyncStatus(overrides: Partial<ICloudSyncStatus> = {}): ICloudSyncStatus {
  return {
    enabled: true,
    state: 'idle',
    accountStatus: 'available',
    pendingOperationCount: 0,
    lastSyncStartedAtMs: null,
    lastSyncSucceededAtMs: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

describe('editor status presentation', () => {
  it('derives saving states in priority order', () => {
    expect(
      deriveEditorSaveStatus({
        isFlushing: false,
        lastSavedAt: 10,
        lastLocalMutationAt: 20,
        saveError: '실패',
      }),
    ).toBe('error');

    expect(
      deriveEditorSaveStatus({
        isFlushing: true,
        lastSavedAt: 10,
        lastLocalMutationAt: 20,
        saveError: null,
      }),
    ).toBe('saving');

    expect(
      deriveEditorSaveStatus({
        isFlushing: false,
        lastSavedAt: 10,
        lastLocalMutationAt: 20,
        saveError: null,
      }),
    ).toBe('pending');

    expect(
      deriveEditorSaveStatus({
        isFlushing: false,
        lastSavedAt: 20,
        lastLocalMutationAt: 20,
        saveError: null,
      }),
    ).toBe('saved');
  });

  it('derives cloud sync indicator states', () => {
    expect(deriveCloudSyncIndicatorStatus(createSyncStatus({ enabled: false }))).toBe('off');
    expect(deriveCloudSyncIndicatorStatus(createSyncStatus({ state: 'offline' }))).toBe('warning');
    expect(deriveCloudSyncIndicatorStatus(createSyncStatus({ state: 'syncing' }))).toBe('syncing');
    expect(
      deriveCloudSyncIndicatorStatus(createSyncStatus({ state: 'idle', pendingOperationCount: 2 })),
    ).toBe('pending');
    expect(deriveCloudSyncIndicatorStatus(createSyncStatus())).toBe('synced');
  });

  it('builds a combined presentation for the header', () => {
    const presentation = deriveEditorStatusPresentation(
      {
        isFlushing: false,
        lastSavedAt: 20,
        lastLocalMutationAt: 20,
        saveError: null,
      },
      createSyncStatus(),
    );

    expect(presentation).toEqual({
      saveLabel: '저장됨',
      saveStatus: 'saved',
      cloudStatus: 'synced',
      cloudTooltip: 'iCloud와 동기화되었습니다.',
    });
  });
});
