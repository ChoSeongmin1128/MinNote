import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockCard } from './BlockCard';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentSessionStore } from '../stores/documentSessionStore';

const {
  changeBlockKind,
  copySelectedBlocks,
  copySingleBlock,
  createBlockBelow,
  deleteSelectedBlocks,
  deleteBlock,
  updateCodeBlock,
  updateMarkdownBlock,
  updateTextBlock,
} = vi.hoisted(() => ({
  changeBlockKind: vi.fn(),
  copySelectedBlocks: vi.fn(),
  copySingleBlock: vi.fn(),
  createBlockBelow: vi.fn(),
  deleteSelectedBlocks: vi.fn(),
  deleteBlock: vi.fn(),
  updateCodeBlock: vi.fn(),
  updateMarkdownBlock: vi.fn(),
  updateTextBlock: vi.fn(),
}));

vi.mock('../app/controllers', () => ({
  useBlockController: () => ({
    changeBlockKind,
    copySelectedBlocks,
    copySingleBlock,
    createBlockBelow,
    deleteSelectedBlocks,
    deleteBlock,
    updateCodeBlock,
    updateMarkdownBlock,
    updateTextBlock,
  }),
}));

vi.mock('./editors/editorLoaders', () => ({
  MarkdownBlockEditor: ({ onCreateBelow }: { onCreateBelow: () => void }) => (
    <button type="button" onClick={onCreateBelow}>
      create-below
    </button>
  ),
  PlainTextBlockEditor: ({ onCreateBelow }: { onCreateBelow: () => void }) => (
    <button type="button" onClick={onCreateBelow}>
      create-below
    </button>
  ),
  preloadEditorForBlockKind: vi.fn(),
}));

describe('BlockCard', () => {
  afterEach(() => {
    createBlockBelow.mockReset();
  });

  it('creates the next block with the workspace default block kind', async () => {
    useWorkspaceStore.setState({ defaultBlockKind: 'code' });
    useDocumentSessionStore.setState({
      currentDocument: null,
      selectedBlockId: null,
      selectedBlockIds: [],
      blockSelected: false,
      allBlocksSelected: false,
      isFlushing: false,
      saveInFlightCount: 0,
      saveError: null,
      lastSavedAt: null,
      lastLocalMutationAt: null,
      focusRequest: null,
      activeEditorRef: null,
    });

    render(
      <BlockCard
        block={{
          id: 'block-1',
          documentId: 'doc-1',
          kind: 'markdown',
          position: 0,
          content: '# Title',
          language: null,
          createdAt: 1,
          updatedAt: 1,
        }}
        isSelected
        isBlockSelected={false}
        isAllSelected={false}
        isAlternate={false}
        isDragging={false}
        isMenuOpen={false}
        onGripPointerDown={vi.fn()}
        onMenuClose={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'create-below' }));

    expect(createBlockBelow).toHaveBeenCalledWith('block-1', 'code');
  });
});
