import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { DocumentVm } from '../application/models/document';
import { useAppShortcuts } from './useAppShortcuts';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useUiStore } from '../stores/uiStore';

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

vi.mock('./useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
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
    activeEditorRef: null,
  });
  useUiStore.setState({
    isSettingsOpen: false,
    desktopSidebarExpanded: true,
    mobileSidebarOpen: false,
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

  it('routes Cmd+Shift+V to the active editor plain-text paste handle', async () => {
    const pastePlainText = vi.fn().mockResolvedValue(true);
    useDocumentSessionStore.setState({
      activeEditorRef: {
        current: {
          cut: vi.fn(),
          copy: vi.fn(),
          paste: vi.fn(),
          pastePlainText,
          selectAll: vi.fn(),
          canUndo: vi.fn(() => false),
          undo: vi.fn(),
          canRedo: vi.fn(() => false),
          redo: vi.fn(),
        },
      },
    });

    render(<Harness />);

    const target = document.createElement('div');
    target.className = 'block-editor';
    document.body.appendChild(target);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(pastePlainText).toHaveBeenCalledTimes(1);
    target.remove();
  });

  it('does not route Cmd+Shift+V from non-block editable inputs', async () => {
    const pastePlainText = vi.fn().mockResolvedValue(true);
    useDocumentSessionStore.setState({
      activeEditorRef: {
        current: {
          cut: vi.fn(),
          copy: vi.fn(),
          paste: vi.fn(),
          pastePlainText,
          selectAll: vi.fn(),
          canUndo: vi.fn(() => false),
          undo: vi.fn(),
          canRedo: vi.fn(() => false),
          redo: vi.fn(),
        },
      },
    });

    render(<Harness />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(pastePlainText).not.toHaveBeenCalled();
    input.remove();
  });

  it('toggles the desktop sidebar with Cmd+B outside editable targets', () => {
    useUiStore.setState({ desktopSidebarExpanded: true });
    render(<Harness />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }));
    });
    expect(useUiStore.getState().desktopSidebarExpanded).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }));
    });
    expect(useUiStore.getState().desktopSidebarExpanded).toBe(true);
  });

  it('does not hijack Cmd+B inside editable targets', () => {
    useUiStore.setState({ desktopSidebarExpanded: true });
    render(<Harness />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }));

    expect(useUiStore.getState().desktopSidebarExpanded).toBe(true);
    input.remove();
  });
});
