import { useImperativeHandle } from 'react';
import type { RefObject } from 'react';
import type { BlockEditorHandle } from '../../lib/editorHandle';
import { syncTextareaHeight } from './plainTextEditorUtils';

interface UsePlainTextEditorHandleOptions {
  ref: React.Ref<BlockEditorHandle>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  emitChange: (nextValue: string, skipHistory?: boolean) => void;
  getValue: () => string;
  undoStackRef: RefObject<string[]>;
  redoStackRef: RefObject<string[]>;
}

export function usePlainTextEditorHandle({
  ref,
  textareaRef,
  emitChange,
  getValue,
  undoStackRef,
  redoStackRef,
}: UsePlainTextEditorHandleOptions) {
  useImperativeHandle(
    ref,
    () => ({
      async cut() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const { selectionStart, selectionEnd } = textarea;
        if (selectionStart === selectionEnd) return false;

        const value = getValue();
        const text = value.slice(selectionStart, selectionEnd);
        await navigator.clipboard.writeText(text);
        const nextValue = `${value.slice(0, selectionStart)}${value.slice(selectionEnd)}`;
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

        await navigator.clipboard.writeText(getValue().slice(selectionStart, selectionEnd));
        return true;
      },
      async paste() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const text = await navigator.clipboard.readText();
        const { selectionStart, selectionEnd } = textarea;
        const value = getValue();
        const nextValue = `${value.slice(0, selectionStart)}${text}${value.slice(selectionEnd)}`;
        const nextCaret = selectionStart + text.length;
        textarea.value = nextValue;
        emitChange(nextValue);
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
        syncTextareaHeight(textarea);
        return true;
      },
      async pastePlainText() {
        const textarea = textareaRef.current;
        if (!textarea) return false;

        const text = await navigator.clipboard.readText();
        const { selectionStart, selectionEnd } = textarea;
        const value = getValue();
        const nextValue = `${value.slice(0, selectionStart)}${text}${value.slice(selectionEnd)}`;
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
      canUndo() {
        return (undoStackRef.current?.length ?? 0) > 0;
      },
      undo() {
        const prev = undoStackRef.current?.pop();
        if (prev === undefined) return;
        redoStackRef.current?.push(getValue());
        emitChange(prev, true);
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.value = prev;
          syncTextareaHeight(textarea);
        }
      },
      canRedo() {
        return (redoStackRef.current?.length ?? 0) > 0;
      },
      redo() {
        const next = redoStackRef.current?.pop();
        if (next === undefined) return;
        undoStackRef.current?.push(getValue());
        emitChange(next, true);
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.value = next;
          syncTextareaHeight(textarea);
        }
      },
    }),
    [emitChange, getValue, redoStackRef, textareaRef, undoStackRef],
  );
}
