import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { DocumentVm } from '../application/models/document';
import { useAppShortcuts } from './useAppShortcuts';
import { useDocumentSessionStore } from '../stores/documentSessionStore';

const controllerMocks = vi.hoisted(() => ({
  copySelectedBlocks: vi.fn().mockResolvedValue(undefined),
  deleteSelectedBlocks: vi.fn().mockResolvedValue(undefined),
  flushCurrentDocument: vi.fn().mockResolvedValue(undefined),
  isBlockClipboardText: vi.fn((text: string) => text.startsWith('<!--minnote-block:')),
  pasteBlocks: vi.fn().mockResolvedValue(undefined),
  undoBlockOperation: vi.fn().mockResolvedValue(undefined),
  redoBlockOperation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../app/controllers', () => ({
  useBlockController: () => ({
    copySelectedBlocks: controllerMocks.copySelectedBlocks,
    deleteSelectedBlocks: controllerMocks.deleteSelectedBlocks,
    isBlockClipboardText: controllerMocks.isBlockClipboardText,
    pasteBlocks: controllerMocks.pasteBlocks,
    undoBlockOperation: controllerMocks.undoBlockOperation,
    redoBlockOperation: controllerMocks.redoBlockOperation,
  }),
  useDocumentController: () => ({
    flushCurrentDocument: controllerMocks.flushCurrentDocument,
  }),
}));

function Harness() {
  useAppShortcuts();
  return null;
}

function createDocument(): DocumentVm {
  return {
    id: 'doc-1',
    title: 'Test',
    blockTintOverride: null,
    documentSurfaceToneOverride: null,
    preview: '',
    updatedAt: 1,
    lastOpenedAt: 1,
    blockCount: 3,
    blocks: [
      {
        id: 'block-a',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 0,
        createdAt: 1,
        updatedAt: 1,
        content: 'A',
        language: null,
      },
      {
        id: 'block-b',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 1,
        createdAt: 1,
        updatedAt: 1,
        content: 'B',
        language: null,
      },
      {
        id: 'block-c',
        documentId: 'doc-1',
        kind: 'markdown',
        position: 2,
        createdAt: 1,
        updatedAt: 1,
        content: 'C',
        language: null,
      },
    ],
  };
}

function resetStore() {
  useDocumentSessionStore.setState({
    currentDocument: null,
    selectedBlockId: null,
    selectedBlockIds: [],
    blockSelected: false,
    allBlocksSelected: false,
    isFlushing: false,
    lastSavedAt: null,
    focusRequest: null,
  });
}

function dispatchPaste(text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  window.dispatchEvent(event);
}

describe('useAppShortcuts', () => {
  beforeEach(() => {
    cleanup();
    resetStore();
    controllerMocks.copySelectedBlocks.mockClear();
    controllerMocks.deleteSelectedBlocks.mockClear();
    controllerMocks.flushCurrentDocument.mockClear();
    controllerMocks.isBlockClipboardText.mockClear();
    controllerMocks.isBlockClipboardText.mockImplementation((text: string) => text.startsWith('<!--minnote-block:'));
    controllerMocks.pasteBlocks.mockClear();

    useDocumentSessionStore.setState({
      currentDocument: createDocument(),
      selectedBlockId: 'block-a',
      selectedBlockIds: ['block-a', 'block-b'],
      blockSelected: true,
      allBlocksSelected: false,
    });
  });

  afterEach(() => {
    cleanup();
    resetStore();
  });

  it('routes delete/copy/cut through the marquee selection set', async () => {
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    expect(controllerMocks.deleteSelectedBlocks).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true }));
    expect(controllerMocks.copySelectedBlocks).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', metaKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(controllerMocks.copySelectedBlocks).toHaveBeenCalledTimes(2);
    expect(controllerMocks.deleteSelectedBlocks).toHaveBeenCalledTimes(2);
  });

  it('lets plain-text paste pass through but intercepts MinNote block clipboard paste', async () => {
    render(<Harness />);

    dispatchPaste('plain text');
    expect(controllerMocks.pasteBlocks).not.toHaveBeenCalled();

    const metadata = '<!--minnote-block:[{"kind":"markdown","content":"# Hello","language":null}]-->\n# Hello';
    dispatchPaste(metadata);
    await Promise.resolve();

    expect(controllerMocks.pasteBlocks).toHaveBeenCalledTimes(1);
    expect(controllerMocks.pasteBlocks).toHaveBeenCalledWith(metadata);
  });
});
