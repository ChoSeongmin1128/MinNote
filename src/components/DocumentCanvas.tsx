import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BlockCard } from './BlockCard';
import { BlockGhostPreview } from './BlockGhostPreview';
import { DocumentMenu } from './DocumentMenu';
import { getEditableDocumentTitle } from '../lib/documentTitle';
import { commitDocumentTitle, moveBlock } from '../controllers/appController';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useBlockReorder } from '../hooks/useBlockReorder';

function DocumentTitleInput({ title }: { title: string | null }) {
  const [draft, setDraft] = useState(getEditableDocumentTitle(title));

  return (
    <input
      className="document-title-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commitDocumentTitle(draft)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void commitDocumentTitle(draft);
          event.currentTarget.blur();
        }
      }}
      placeholder="Untitled"
    />
  );
}

export function DocumentCanvas() {
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const selectedBlockId = useDocumentSessionStore((state) => state.selectedBlockId);
  const blockSelected = useDocumentSessionStore((state) => state.blockSelected);
  const allBlocksSelected = useDocumentSessionStore((state) => state.allBlocksSelected);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
  const blocksSelectionRef = useRef<HTMLDivElement | null>(null);

  const blocks = useMemo(() => currentDocument?.blocks ?? [], [currentDocument?.blocks]);
  const blockTintPreset = currentDocument?.blockTintOverride ?? defaultBlockTintPreset;
  const [openBlockMenuId, setOpenBlockMenuId] = useState<string | null>(null);
  const { surfaceRef, dragState, dragPreview, handleGripPointerDown } = useBlockReorder({
    blocks,
    onReorder: (blockId, targetPosition) => void moveBlock(blockId, targetPosition),
    onDragStart: () => setOpenBlockMenuId(null),
  });
  const activePreviewBlock =
    dragPreview == null ? null : blocks.find((block) => block.id === dragPreview.blockId) ?? null;

  useEffect(() => {
    if (!allBlocksSelected) {
      // 전체 선택 해제 시 남아있는 selection 클리어
      const selection = window.getSelection();
      if (selection && blocksSelectionRef.current?.contains(selection.anchorNode)) {
        selection.removeAllRanges();
      }
      return;
    }

    if (!blocksSelectionRef.current) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest('.document-surface')) {
      activeElement.blur();
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(blocksSelectionRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [allBlocksSelected, currentDocument?.id, currentDocument?.blocks.length]);

  if (!currentDocument) {
    return (
      <section className="empty-state">
        <span>빈 문서입니다.</span>
        <p>문서를 만들거나 사이드바에서 기존 문서를 선택해 주세요.</p>
      </section>
    );
  }

  return (
    <section className="document-canvas">
      <div ref={surfaceRef} className="document-surface" data-block-preset={blockTintPreset}>
        <div className="document-head">
          <DocumentTitleInput key={`${currentDocument.id}:${currentDocument.title ?? ''}`} title={currentDocument.title} />
          <DocumentMenu />
        </div>

        <div ref={blocksSelectionRef}>
          <div
            className={`block-drop-slot${dragState?.targetSlotIndex === 0 ? ' is-active' : ''}`}
            data-drop-slot-index={0}
          />
          {blocks.map((block, index) => (
            <Fragment key={block.id}>
              <BlockCard
                block={block}
                isSelected={selectedBlockId === block.id}
                isBlockSelected={blockSelected && selectedBlockId === block.id}
                isAllSelected={allBlocksSelected}
                isAlternate={index % 2 === 1}
                isDragging={dragState?.activeId === block.id}
                isMenuOpen={openBlockMenuId === block.id}
                onGripPointerDown={handleGripPointerDown}
                onMenuClose={() =>
                  setOpenBlockMenuId((current) => (current === block.id ? null : current))
                }
              />
              <div
                className={`block-drop-slot${dragState?.targetSlotIndex === index + 1 ? ' is-active' : ''}`}
                data-drop-slot-index={index + 1}
              />
            </Fragment>
          ))}
        </div>
      </div>
      {dragState && dragPreview && activePreviewBlock ? (
        <div
          className="drag-preview"
          style={{
            width: `${dragPreview.width}px`,
            transform: `translate(${dragState.pointerX + 14}px, ${dragState.pointerY + 14}px)`,
          }}
        >
          <BlockGhostPreview block={activePreviewBlock} preset={blockTintPreset} />
        </div>
      ) : null}
    </section>
  );
}
