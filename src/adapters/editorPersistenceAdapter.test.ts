import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorPersistenceAdapter } from './editorPersistenceAdapter';

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('editorPersistenceAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps pending autosave content when the timer save fails and retries on flush', async () => {
    const errorHandler = vi.fn();
    const backend = {
      updateMarkdownBlock: vi.fn()
        .mockRejectedValueOnce(new Error('save failed'))
        .mockResolvedValueOnce({}),
      updateCodeBlock: vi.fn(),
      updateTextBlock: vi.fn(),
      flushDocument: vi.fn().mockResolvedValueOnce(123),
    };
    const adapter = createEditorPersistenceAdapter(backend as never);
    adapter.setErrorHandler(errorHandler);

    adapter.queueBlockSave('doc-1', 'block-1', {
      kind: 'markdown',
      content: '# hello',
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(backend.updateMarkdownBlock).toHaveBeenCalledTimes(1);

    await expect(adapter.flushDocument('doc-1')).resolves.toBe(123);
    expect(backend.updateMarkdownBlock).toHaveBeenCalledTimes(2);
    expect(backend.flushDocument).toHaveBeenCalledTimes(1);
  });

  it('does not drop a newer queued save when an older save finishes later', async () => {
    const deferred = createDeferred();
    const backend = {
      updateMarkdownBlock: vi.fn()
        .mockImplementationOnce(async () => {
          await deferred.promise;
          return {};
        })
        .mockResolvedValueOnce({}),
      updateCodeBlock: vi.fn(),
      updateTextBlock: vi.fn(),
      flushDocument: vi.fn().mockResolvedValueOnce(456),
    };
    const adapter = createEditorPersistenceAdapter(backend as never);

    adapter.queueBlockSave('doc-1', 'block-1', {
      kind: 'markdown',
      content: 'first',
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(backend.updateMarkdownBlock).toHaveBeenCalledTimes(1);

    adapter.queueBlockSave('doc-1', 'block-1', {
      kind: 'markdown',
      content: 'second',
    });

    deferred.resolve();
    await Promise.resolve();

    await expect(adapter.flushDocument('doc-1')).resolves.toBe(456);
    expect(backend.updateMarkdownBlock).toHaveBeenNthCalledWith(1, 'block-1', 'first');
    expect(backend.updateMarkdownBlock).toHaveBeenNthCalledWith(2, 'block-1', 'second');
    expect(backend.flushDocument).toHaveBeenCalledTimes(1);
  });
});
