import { ko } from '@blocknote/core/locales';
import { BlockNoteViewRaw, useCreateBlockNote } from '@blocknote/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  focusBlockNote,
  replaceBlockNoteMarkdown,
} from '../../lib/blocknoteBridge';
import { normalizeMarkdownContent } from '../../lib/markdown';
import type { BlockEditorHandle } from '../../lib/editorHandle';
import type { BlockCaretPlacement } from '../../lib/types';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import {
  createCurrentMarkdownReader,
  emitSelectionVisualStateForEditor,
} from './markdownBlockSelection';
import { createEmptyMarkdownBlocks, markdownSchema } from './markdownBlockSchema';
import { createMarkdownEditorHandle } from './markdownBlockHandle';
import { createMarkdownKeydownHandler } from './markdownBlockKeydown';

interface MarkdownBlockEditorProps {
  blockId: string;
  content: string;
  isSelected: boolean;
  focusPlacement: BlockCaretPlacement | null;
  focusNonce: number;
  onChange: (content: string) => void;
  onFocus: () => void;
  onSelectionVisualChange?: (state: {
    hasSelection: boolean;
    isWholeBlockSelected: boolean;
  }) => void;
  onCreateBelow: () => void;
  onNavigatePrevious: (caret: BlockCaretPlacement) => void;
  onNavigateNext: (caret: BlockCaretPlacement) => void;
  onDeleteIfEmpty: () => void;
}

export const MarkdownBlockEditor = forwardRef<BlockEditorHandle, MarkdownBlockEditorProps>(function MarkdownBlockEditor({
  blockId,
  content,
  isSelected,
  focusPlacement,
  focusNonce,
  onChange,
  onFocus,
  onSelectionVisualChange,
  onCreateBelow,
  onNavigatePrevious,
  onNavigateNext,
  onDeleteIfEmpty,
}, ref) {
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const isApplyingRemoteContentRef = useRef(false);
  const isWholeBlockSelectedRef = useRef(false);
  const deleteReadyRef = useRef(false);
  const lastSerializedMarkdownRef = useRef(normalizeMarkdownContent(content));
  const resolvedTheme = useResolvedTheme(themeMode);

  const editor = useCreateBlockNote(
    {
      schema: markdownSchema,
      dictionary: {
        ...ko,
        placeholders: {
          ...ko.placeholders,
          default: "입력하거나 '/'를 눌러 명령 보기",
        },
      },
      initialContent: createEmptyMarkdownBlocks(),
      _tiptapOptions: {
        editorProps: {
          attributes: {
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          },
        },
      },
    },
    [blockId],
  );

  const emitSelectionVisualState = useCallback(
    () => emitSelectionVisualStateForEditor(editor, isWholeBlockSelectedRef.current, onSelectionVisualChange),
    [editor, onSelectionVisualChange],
  );

  const getCurrentMarkdown = useMemo(() => createCurrentMarkdownReader(editor), [editor]);

  useEffect(() => {
    const nextMarkdown = normalizeMarkdownContent(content);
    const currentMarkdown = getCurrentMarkdown();

    if (nextMarkdown === currentMarkdown || nextMarkdown === lastSerializedMarkdownRef.current) {
      lastSerializedMarkdownRef.current = nextMarkdown;
      return;
    }

    isApplyingRemoteContentRef.current = true;
    replaceBlockNoteMarkdown(editor, nextMarkdown, createEmptyMarkdownBlocks);
    lastSerializedMarkdownRef.current = nextMarkdown;
    requestAnimationFrame(() => {
      isApplyingRemoteContentRef.current = false;
      emitSelectionVisualState();
    });
  }, [content, editor, getCurrentMarkdown, emitSelectionVisualState]);

  useEffect(() => {
    emitSelectionVisualState();
  }, [emitSelectionVisualState]);
  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (isApplyingRemoteContentRef.current) {
        return;
      }

      isWholeBlockSelectedRef.current = false;
      const nextMarkdown = getCurrentMarkdown();
      lastSerializedMarkdownRef.current = nextMarkdown;
      onChange(nextMarkdown);
      emitSelectionVisualState();
    });

    return unsubscribe;
  }, [editor, emitSelectionVisualState, getCurrentMarkdown, onChange]);

  useEffect(() => {
    const unsubscribe = editor.onSelectionChange(() => {
      if (editor.getSelectedText().length === 0) {
        isWholeBlockSelectedRef.current = false;
      }
      emitSelectionVisualState();
    });

    return unsubscribe;
  }, [editor, emitSelectionVisualState]);

  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      createMarkdownKeydownHandler({
        editor,
        isWholeBlockSelectedRef,
        deleteReadyRef,
        emitSelectionVisualState,
        getCurrentMarkdown,
        onCreateBelow,
        onNavigatePrevious,
        onNavigateNext,
        onDeleteIfEmpty,
      })(event);
    };

    root.addEventListener('keydown', handleKeyDown, true);
    return () => root.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, emitSelectionVisualState, getCurrentMarkdown, onCreateBelow, onDeleteIfEmpty, onNavigateNext, onNavigatePrevious]);

  useEffect(() => {
    if (!focusPlacement) {
      return;
    }

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 20;

    const attempt = () => {
      if (cancelled || retryCount >= MAX_RETRIES) return;
      retryCount++;

      if (focusBlockNote(editor, focusPlacement === 'start' ? 'start' : 'end')) {
        isWholeBlockSelectedRef.current = false;
        emitSelectionVisualState();
      } else {
        requestAnimationFrame(attempt);
      }
    };

    const timer = setTimeout(() => {
      if (!cancelled) attempt();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editor, emitSelectionVisualState, focusPlacement, focusNonce]);

  useEffect(() => {
    if (!isSelected) {
      isWholeBlockSelectedRef.current = false;
      emitSelectionVisualState();
    }
  }, [emitSelectionVisualState, isSelected]);

  useImperativeHandle(
    ref,
    () =>
      createMarkdownEditorHandle({
        editor,
        isWholeBlockSelectedRef,
        emitSelectionVisualState,
        getCurrentMarkdown,
      }),
    [editor, emitSelectionVisualState, getCurrentMarkdown],
  );

  return (
    <div
      ref={editorRootRef}
      className="block-editor block-editor-shell is-markdown"
      onFocusCapture={onFocus}
    >
      <div className="markdown-blocknote-shell">
        <BlockNoteViewRaw
          editor={editor}
          theme={resolvedTheme}
          formattingToolbar={false}
          linkToolbar={false}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          tableHandles={false}
          emojiPicker={false}
          comments={false}
        />
      </div>
    </div>
  );
});
