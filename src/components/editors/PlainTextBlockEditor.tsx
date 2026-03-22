import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  highlightCodeToHtml,
  loadCodeLanguageRegistration,
  normalizeCodeLanguage,
  type CodeLanguageId,
} from '../../lib/blockOptions';
import type { BlockEditorHandle } from '../../lib/editorHandle';
import type { BlockCaretPlacement } from '../../lib/types';

interface PlainTextBlockEditorProps {
  mode: 'code' | 'text';
  value: string;
  language?: CodeLanguageId | null;
  focusPlacement: BlockCaretPlacement | null;
  focusNonce: number;
  onChange: (value: string, language: CodeLanguageId | null) => void;
  onFocus: () => void;
  onCreateBelow: () => void;
  onNavigatePrevious: (caret: BlockCaretPlacement) => void;
  onNavigateNext: (caret: BlockCaretPlacement) => void;
  onDeleteIfEmpty: () => void;
}

function getLineStart(value: string, position: number) {
  return value.lastIndexOf('\n', Math.max(position - 1, 0)) + 1;
}

function getLineEnd(value: string, position: number) {
  const nextBreak = value.indexOf('\n', position);
  return nextBreak === -1 ? value.length : nextBreak;
}

function syncTextareaHeight(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = '0px';
  textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`;
}

export const PlainTextBlockEditor = forwardRef<BlockEditorHandle, PlainTextBlockEditorProps>(function PlainTextBlockEditor({
  mode,
  value,
  language,
  focusPlacement,
  focusNonce,
  onChange,
  onFocus,
  onCreateBelow,
  onNavigatePrevious,
  onNavigateNext,
  onDeleteIfEmpty,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLPreElement | null>(null);
  const currentValueRef = useRef(value);
  const [highlightSource, setHighlightSource] = useState(value);
  const [loadedLanguage, setLoadedLanguage] = useState<{ id: CodeLanguageId; key: string | null } | null>(null);

  const resolvedLanguage = mode === 'code' ? normalizeCodeLanguage(language ?? 'plaintext') : 'plaintext';
  const activeLanguageKey = mode === 'code' && loadedLanguage?.id === resolvedLanguage ? loadedLanguage.key : null;

  useEffect(() => {
    let cancelled = false;

    if (mode !== 'code') {
      return;
    }

    void loadCodeLanguageRegistration(resolvedLanguage).then((registration) => {
      if (!cancelled) {
        setLoadedLanguage(registration);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, resolvedLanguage]);

  // 외부에서 value가 변경된 경우만 textarea DOM을 직접 업데이트
  useEffect(() => {
    if (value !== currentValueRef.current) {
      currentValueRef.current = value;
      setHighlightSource(value);
      if (textareaRef.current) {
        textareaRef.current.value = value;
        syncTextareaHeight(textareaRef.current);
      }
    }
  }, [value]);

  useLayoutEffect(() => {
    syncTextareaHeight(textareaRef.current);
  }, [highlightSource, mode]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !focusPlacement) {
      return;
    }

    const position = focusPlacement === 'start' ? 0 : textarea.value.length;
    textarea.focus();
    textarea.setSelectionRange(position, position);
  }, [focusPlacement, focusNonce]);

  const highlightedHtml = useMemo(() => {
    if (mode !== 'code') {
      return '';
    }

    return highlightCodeToHtml(activeLanguageKey, highlightSource);
  }, [activeLanguageKey, mode, highlightSource]);

  const syncOverlayScroll = () => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    if (!textarea || !overlay) {
      return;
    }

    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };

  const emitChange = useCallback((nextValue: string) => {
    currentValueRef.current = nextValue;
    setHighlightSource(nextValue);
    onChange(nextValue, mode === 'code' ? resolvedLanguage : null);
  }, [mode, onChange, resolvedLanguage]);

  const getVal = useCallback(() => textareaRef.current?.value ?? currentValueRef.current, []);

  useImperativeHandle(
    ref,
    () => ({
      async cut() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const { selectionStart, selectionEnd } = textarea;
        if (selectionStart === selectionEnd) return false;

        const val = getVal();
        const text = val.slice(selectionStart, selectionEnd);
        await navigator.clipboard.writeText(text);
        const nextValue = `${val.slice(0, selectionStart)}${val.slice(selectionEnd)}`;
        textarea.value = nextValue;
        emitChange(nextValue);
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionStart);
        syncTextareaHeight(textarea);
        return true;
      },
      async copy() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const { selectionStart, selectionEnd } = textarea;
        if (selectionStart === selectionEnd) return false;

        await navigator.clipboard.writeText(getVal().slice(selectionStart, selectionEnd));
        return true;
      },
      async paste() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const text = await navigator.clipboard.readText();
        const { selectionStart, selectionEnd } = textarea;
        const val = getVal();
        const nextValue = `${val.slice(0, selectionStart)}${text}${val.slice(selectionEnd)}`;
        const nextCaret = selectionStart + text.length;
        textarea.value = nextValue;
        emitChange(nextValue);
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
        syncTextareaHeight(textarea);
        return true;
      },
      selectAll() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        textarea.focus();
        textarea.setSelectionRange(0, textarea.value.length);
        return true;
      },
    }),
    [emitChange, getVal],
  );

  return (
    <div className={`block-editor block-editor-shell ${mode === 'code' ? 'is-code' : 'is-text'}`}>
      <div className={`plain-editor${mode === 'code' ? ' is-code' : ' is-text'}`}>
        {mode === 'code' ? (
          <pre ref={overlayRef} className="plain-editor-highlight" aria-hidden="true">
            <code
              className="hljs"
              dangerouslySetInnerHTML={{ __html: `${highlightedHtml || ''}\n` }}
            />
          </pre>
        ) : null}
        <textarea
          ref={textareaRef}
          className={`plain-editor-input${mode === 'code' ? ' is-code' : ' is-text'}`}
          defaultValue={value}
          spellCheck={mode !== 'code'}
          autoCapitalize="off"
          autoCorrect="off"
          wrap={mode === 'code' ? 'off' : 'soft'}
          onFocus={onFocus}
          onScroll={syncOverlayScroll}
          onInput={(event) => {
            const textarea = event.currentTarget;
            emitChange(textarea.value);
            syncTextareaHeight(textarea);
          }}
          onKeyDown={(event) => {
            const textarea = event.currentTarget;
            const { selectionStart, selectionEnd } = textarea;
            const isCollapsed = selectionStart === selectionEnd;
            const val = textarea.value;

            if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowUp') {
              event.preventDefault();
              onNavigatePrevious('end');
              return;
            }

            if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowDown') {
              event.preventDefault();
              onNavigateNext('start');
              return;
            }

            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              onCreateBelow();
              return;
            }

            if (event.key === 'Tab') {
              event.preventDefault();
              const TAB = '    ';
              const lineStart = getLineStart(val, selectionStart);
              if (event.shiftKey) {
                const linePrefix = val.slice(lineStart, lineStart + TAB.length);
                const removeCount = Math.min(TAB.length, linePrefix.length - linePrefix.trimStart().length);
                if (removeCount > 0) {
                  const nextValue = `${val.slice(0, lineStart)}${val.slice(lineStart + removeCount)}`;
                  textarea.value = nextValue;
                  textarea.setSelectionRange(selectionStart - removeCount, selectionEnd - removeCount);
                  emitChange(nextValue);
                  syncTextareaHeight(textarea);
                }
              } else {
                const nextValue = `${val.slice(0, lineStart)}${TAB}${val.slice(lineStart)}`;
                textarea.value = nextValue;
                textarea.setSelectionRange(selectionStart + TAB.length, selectionEnd + TAB.length);
                emitChange(nextValue);
                syncTextareaHeight(textarea);
              }
              return;
            }

            if (event.key === 'Backspace' && val.length === 0 && isCollapsed) {
              event.preventDefault();
              onDeleteIfEmpty();
              return;
            }

            if (event.key === 'ArrowUp' && isCollapsed && selectionStart === getLineStart(val, selectionStart) && getLineStart(val, selectionStart) === 0) {
              event.preventDefault();
              onNavigatePrevious('end');
              return;
            }

            if (
              event.key === 'ArrowDown' &&
              isCollapsed &&
              selectionStart === getLineEnd(val, selectionStart) &&
              getLineEnd(val, selectionStart) === val.length
            ) {
              event.preventDefault();
              onNavigateNext('start');
            }
          }}
        />
      </div>
    </div>
  );
});
