import { Copy, GripVertical, Trash2 } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { BlockVm } from '../adapters/documentAdapter';
import {
  changeBlockKind,
  copySingleBlock,
  createBlockBelow,
  deleteBlock,
  updateCodeBlock,
  updateMarkdownBlock,
  updateTextBlock,
} from '../controllers/appController';
import { createEmptyMarkdownContent } from '../lib/markdown';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { BlockEditorHandle } from '../lib/editorHandle';
import type { CodeLanguageId } from '../lib/blockOptions';
import type { BlockCaretPlacement, BlockKind } from '../lib/types';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { BlockMenu } from './BlockMenu';
import { CodeLanguageTrigger } from './CodeLanguageMenu';
import { ContextMenu } from './ContextMenu';
import {
  buildBlockContextMenuItems,
  handleBlockContextAction,
  isEffectivelyEmpty,
  preloadBlockCardEditor,
} from './blockCardSupport';
import {
  MarkdownBlockEditor,
  PlainTextBlockEditor,
} from './editors/editorLoaders';
import { TypeMenu } from './TypeMenu';

interface BlockCardProps {
  block: BlockVm;
  isSelected: boolean;
  isBlockSelected: boolean;
  isAllSelected: boolean;
  isAlternate: boolean;
  isDragging: boolean;
  isMenuOpen: boolean;
  onGripPointerDown: (blockId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMenuClose: () => void;
}

function EditorFallback() {
  return <div className="block-editor-loading" aria-hidden="true" />;
}

export function BlockCard({
  block,
  isSelected,
  isBlockSelected,
  isAllSelected,
  isAlternate,
  isDragging,
  isMenuOpen,
  onGripPointerDown,
  onMenuClose,
}: BlockCardProps) {
  const [typeMenuAnchor, setTypeMenuAnchor] = useState<DOMRect | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const blockCardRef = useRef<HTMLElement | null>(null);
  const [markdownSelectionState, setMarkdownSelectionState] = useState({
    hasSelection: false,
    isWholeBlockSelected: false,
  });
  const setSelectedBlockId = useDocumentSessionStore((state) => state.setSelectedBlockId);
  const setAllBlocksSelected = useDocumentSessionStore((state) => state.setAllBlocksSelected);
  const focusPreviousBlock = useDocumentSessionStore((state) => state.focusPreviousBlock);
  const focusNextBlock = useDocumentSessionStore((state) => state.focusNextBlock);
  const focusRequest = useDocumentSessionStore((state) => state.focusRequest);
  const editorRef = useRef<BlockEditorHandle | null>(null);

  const isEmpty = isEffectivelyEmpty(block);
  const focusPlacement: BlockCaretPlacement | null =
    focusRequest?.blockId === block.id ? focusRequest.caret : null;
  const focusNonce = focusRequest?.blockId === block.id ? focusRequest.nonce : 0;

  useEffect(() => {
    if (!isSelected) {
      return;
    }

    void preloadBlockCardEditor(block.kind);
  }, [block.kind, isSelected]);

  const handleTypeChange = useCallback(async (kind: BlockKind) => {
    setTypeMenuAnchor(null);
    setContextMenuPosition(null);
    onMenuClose();
    if (kind === block.kind) {
      return;
    }

    await changeBlockKind(block.id, kind);

    if (kind === 'markdown') {
      updateMarkdownBlock(block.id, createEmptyMarkdownContent());
      return;
    }

    if (kind === 'text') {
      updateTextBlock(block.id, '');
      return;
    }

    if (kind === 'code') {
      const lastLang = useWorkspaceStore.getState().lastCodeLanguage;
      updateCodeBlock(block.id, '', lastLang);
      return;
    }
  }, [block.id, block.kind, onMenuClose]);

  const handleDeleteWithAnimation = useCallback(() => {
    setContextMenuPosition(null);
    setIsExiting(true);
    setTimeout(() => void deleteBlock(block.id), 180);
  }, [block.id]);

  const handleDeleteIfEmpty = handleDeleteWithAnimation;

  const handleLanguageChange = useCallback((language: CodeLanguageId) => {
    setContextMenuPosition(null);
    onMenuClose();
    if (block.kind !== 'code') {
      return;
    }
    useWorkspaceStore.getState().setLastCodeLanguage(language);
    updateCodeBlock(block.id, block.content, language);
  }, [block.content, block.id, block.kind, onMenuClose]);

  const handleBlockFocus = () => {
    setSelectedBlockId(block.id);
    setAllBlocksSelected(false);
  };

  const handleCut = useCallback(async () => {
    await editorRef.current?.cut();
  }, []);

  const handleCopy = useCallback(async () => {
    await editorRef.current?.copy();
  }, []);

  const handlePaste = useCallback(async () => {
    await editorRef.current?.paste();
  }, []);

  const handleSelectAll = useCallback(async () => {
    editorRef.current?.selectAll();
  }, []);

  const contextMenuItems = useMemo(
    () => buildBlockContextMenuItems(),
    [],
  );

  const handleContextAction = useCallback(
    async (actionId: string) => {
      await handleBlockContextAction(actionId, {
        onCut: handleCut,
        onCopy: handleCopy,
        onPaste: handlePaste,
        onSelectAll: handleSelectAll,
        onDelete: handleDeleteIfEmpty,
      });
    },
    [handleCopy, handleCut, handleDeleteIfEmpty, handlePaste, handleSelectAll],
  );

  return (
    <section
      ref={blockCardRef}
      data-block-card-id={block.id}
      className={`block-card block-card-${block.kind}${isSelected ? ' is-selected' : ''}${isBlockSelected ? ' is-block-selected' : ''}${markdownSelectionState.hasSelection ? ' has-editor-selection' : ''}${markdownSelectionState.isWholeBlockSelected ? ' is-markdown-select-all' : ''}${isAllSelected ? ' is-all-selected' : ''}${isAlternate ? ' is-alternate' : ''}${isDragging ? ' is-dragging' : ''}${isExiting ? ' is-exiting' : ''}`}
      onPointerEnter={() => {
        void preloadBlockCardEditor(block.kind);
      }}
      onClick={() => {
        handleBlockFocus();
        setTypeMenuAnchor(null);
        setContextMenuPosition(null);
        onMenuClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        handleBlockFocus();
        setTypeMenuAnchor(null);
        onMenuClose();
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
      }}
      onKeyDownCapture={(event) => {
        if (event.key === '/' && isEmpty) {
          event.preventDefault();
          onMenuClose();
          const rect = blockCardRef.current?.getBoundingClientRect();
          if (rect) setTypeMenuAnchor(rect);
        }
      }}
    >
      <div className="block-header">
        <div className="block-meta-row">
          <button
            className="drag-handle"
            type="button"
            aria-label="블록 이동"
            aria-expanded={isMenuOpen}
            onPointerDown={(event) => onGripPointerDown(block.id, event)}
          >
            <GripVertical size={14} />
          </button>
        </div>
      </div>

      <div className="block-actions">
        <button
          type="button"
          aria-label="블록 복사"
          onClick={(event) => {
            event.stopPropagation();
            void copySingleBlock(block.id);
          }}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="is-danger"
          aria-label="블록 삭제"
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteWithAnimation();
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {block.kind === 'markdown' || block.kind === 'text' ? (
        <span className="block-kind-badge">
          {block.kind === 'markdown' ? 'Markdown' : 'Text'}
        </span>
      ) : null}

      {block.kind === 'code' ? (
        <CodeLanguageTrigger
          value={block.language}
          isVisible={isSelected || isMenuOpen || contextMenuPosition != null}
          onSelect={handleLanguageChange}
        />
      ) : null}

      {typeMenuAnchor ? (
        <TypeMenu
          anchorRect={typeMenuAnchor}
          onSelect={(kind) => void handleTypeChange(kind)}
          onClose={() => setTypeMenuAnchor(null)}
        />
      ) : null}
      {isMenuOpen ? (
        <BlockMenu
          block={block}
          isEmpty={isEmpty}
          onClose={onMenuClose}
          onDelete={handleDeleteIfEmpty}
          onSelectKind={(kind) => void handleTypeChange(kind)}
        />
      ) : null}
      {contextMenuPosition ? (
        <ContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          items={contextMenuItems}
          onAction={handleContextAction}
          onClose={() => setContextMenuPosition(null)}
        />
      ) : null}

      <Suspense fallback={<EditorFallback />}>
        {block.kind === 'markdown' ? (
          <MarkdownBlockEditor
            ref={editorRef}
            blockId={block.id}
            content={block.content}
            isSelected={isSelected}
            focusPlacement={focusPlacement}
            focusNonce={focusNonce}
            onFocus={handleBlockFocus}
            onSelectionVisualChange={setMarkdownSelectionState}
            onCreateBelow={() => void createBlockBelow(block.id)}
            onNavigatePrevious={(caret) => focusPreviousBlock(block.id, caret)}
            onNavigateNext={(caret) => focusNextBlock(block.id, caret)}
            onDeleteIfEmpty={handleDeleteIfEmpty}
            onChange={(content) => updateMarkdownBlock(block.id, content)}
          />
        ) : null}

        {block.kind === 'code' ? (
          <PlainTextBlockEditor
            ref={editorRef}
            mode="code"
            value={block.content}
            language={block.language}
            focusPlacement={focusPlacement}
            focusNonce={focusNonce}
            onFocus={handleBlockFocus}
            onCreateBelow={() => void createBlockBelow(block.id)}
            onNavigatePrevious={(caret) => focusPreviousBlock(block.id, caret)}
            onNavigateNext={(caret) => focusNextBlock(block.id, caret)}
            onDeleteIfEmpty={handleDeleteIfEmpty}
            onChange={(content, language) => updateCodeBlock(block.id, content, language)}
          />
        ) : null}

        {block.kind === 'text' ? (
          <MarkdownBlockEditor
            ref={editorRef}
            blockId={block.id}
            content={block.content}
            isSelected={isSelected}
            focusPlacement={focusPlacement}
            focusNonce={focusNonce}
            onFocus={handleBlockFocus}
            onSelectionVisualChange={setMarkdownSelectionState}
            onCreateBelow={() => void createBlockBelow(block.id)}
            onNavigatePrevious={(caret) => focusPreviousBlock(block.id, caret)}
            onNavigateNext={(caret) => focusNextBlock(block.id, caret)}
            onDeleteIfEmpty={handleDeleteIfEmpty}
            onChange={(content) => updateTextBlock(block.id, content)}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
