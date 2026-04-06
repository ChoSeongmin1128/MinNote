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
    const cleanSaveInput = {
      isFlushing: false,
      lastSavedAt: 20,
      lastLocalMutationAt: 20,
      saveError: null,
    };

    expect(deriveCloudSyncIndicatorStatus(cleanSaveInput, createSyncStatus({ enabled: false }))).toBe('off');
    expect(deriveCloudSyncIndicatorStatus(cleanSaveInput, createSyncStatus({ state: 'offline' }))).toBe('warning');
    expect(deriveCloudSyncIndicatorStatus(cleanSaveInput, createSyncStatus({ state: 'syncing' }))).toBe('syncing');
    expect(
      deriveCloudSyncIndicatorStatus(
        cleanSaveInput,
        createSyncStatus({ state: 'idle', pendingOperationCount: 2 }),
      ),
    ).toBe('pending');
    expect(deriveCloudSyncIndicatorStatus(cleanSaveInput, createSyncStatus())).toBe('synced');
  });

  it('treats local unsaved changes as cloud pending before backend status catches up', () => {
    expect(
      deriveCloudSyncIndicatorStatus(
        {
          isFlushing: true,
          lastSavedAt: 20,
          lastLocalMutationAt: 20,
          saveError: null,
        },
        createSyncStatus(),
      ),
    ).toBe('pending');

    expect(
      deriveCloudSyncIndicatorStatus(
        {
          isFlushing: false,
          lastSavedAt: 20,
          lastLocalMutationAt: 21,
          saveError: null,
        },
        createSyncStatus(),
      ),
    ).toBe('pending');

    expect(
      deriveCloudSyncIndicatorStatus(
        {
          isFlushing: false,
          lastSavedAt: 20,
          lastLocalMutationAt: 21,
          saveError: '저장 실패',
        },
        createSyncStatus(),
      ),
    ).toBe('pending');
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
