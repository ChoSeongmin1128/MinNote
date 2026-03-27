import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDocumentController } from '../app/controllers';
import { BlockTintPreview } from './BlockTintPreview';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import { DOCUMENT_SURFACE_TONE_PRESETS } from '../lib/documentSurfaceTone';
import { DocumentSurfacePreview } from './DocumentSurfacePreview';
import { SegmentedSelector } from './SegmentedSelector';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

const DOCUMENT_TINT_MODE_OPTIONS = [
  { value: 'default', label: '기본값 사용' },
  { value: 'custom', label: '문서별 설정' },
] as const;

const DOCUMENT_TINT_OPTIONS = BLOCK_TINT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

const DOCUMENT_SURFACE_TONE_OPTIONS = DOCUMENT_SURFACE_TONE_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export function DocumentMenu() {
  const {
    deleteDocument,
    setDocumentBlockTintOverride,
    setDocumentSurfaceToneOverride,
  } = useDocumentController();
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
  const defaultDocumentSurfaceTonePreset = useWorkspaceStore((state) => state.defaultDocumentSurfaceTonePreset);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!currentDocument) {
    return null;
  }

  const isFollowingDefault = currentDocument.blockTintOverride == null;
  const selectedPreset = currentDocument.blockTintOverride ?? defaultBlockTintPreset;
  const isFollowingDefaultSurfaceTone = currentDocument.documentSurfaceToneOverride == null;
  const selectedSurfaceTone = currentDocument.documentSurfaceToneOverride ?? defaultDocumentSurfaceTonePreset;

  return (
    <div className="document-menu" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        aria-label="문서 메뉴"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen ? (
        <div className="document-menu-popover" role="menu">
          <div className="document-menu-section">
            <div className="document-menu-section-header">
              <span className="document-menu-label">문서 색상쌍</span>
            </div>
            <SegmentedSelector
              ariaLabel="문서 색상쌍 모드 선택"
              tone="popover"
              motionStyle="subtle"
              value={isFollowingDefault ? 'default' : 'custom'}
              options={DOCUMENT_TINT_MODE_OPTIONS}
              onChange={(nextValue) => {
                if (nextValue === 'default') {
                  return setDocumentBlockTintOverride(null);
                }

                return setDocumentBlockTintOverride(defaultBlockTintPreset);
              }}
            />
            <SegmentedSelector
              ariaLabel="문서 색상쌍 선택"
              tone="popover"
              motionStyle="subtle"
              value={selectedPreset}
              layout="palette"
              columns={2}
              disabled={isFollowingDefault}
              options={DOCUMENT_TINT_OPTIONS}
              onChange={(nextValue) => setDocumentBlockTintOverride(nextValue)}
              renderOption={(option) => (
                <span className="tint-selector-card">
                  <BlockTintPreview
                    className="tint-selector-preview"
                    preset={option.value}
                    variant="swatches"
                  />
                  <span className="tint-selector-label">{option.label}</span>
                </span>
              )}
            />
          </div>

          <div className="document-menu-section">
            <div className="document-menu-section-header">
              <span className="document-menu-label">문서 배경 톤</span>
            </div>
            <SegmentedSelector
              ariaLabel="문서 배경 톤 모드 선택"
              tone="popover"
              motionStyle="subtle"
              value={isFollowingDefaultSurfaceTone ? 'default' : 'custom'}
              options={DOCUMENT_TINT_MODE_OPTIONS}
              onChange={(nextValue) => {
                if (nextValue === 'default') {
                  return setDocumentSurfaceToneOverride(null);
                }

                return setDocumentSurfaceToneOverride(
                  defaultDocumentSurfaceTonePreset === 'default'
                    ? 'paper'
                    : defaultDocumentSurfaceTonePreset,
                );
              }}
            />
            <SegmentedSelector
              ariaLabel="문서 배경 톤 선택"
              tone="popover"
              motionStyle="subtle"
              value={selectedSurfaceTone}
              layout="palette"
              columns={2}
              disabled={isFollowingDefaultSurfaceTone}
              options={DOCUMENT_SURFACE_TONE_OPTIONS}
              onChange={(nextValue) => setDocumentSurfaceToneOverride(nextValue)}
              renderOption={(option) => (
                <span className="tint-selector-card">
                  <DocumentSurfacePreview
                    className="surface-selector-preview"
                    preset={option.value}
                    variant="surface"
                  />
                  <span className="tint-selector-label">{option.label}</span>
                </span>
              )}
            />
          </div>

          <div className="document-menu-divider" />

          <button
            className="document-menu-danger"
            type="button"
            onClick={() => {
              setIsOpen(false);
              void deleteDocument(currentDocument.id);
            }}
          >
            <Trash2 size={14} />
            문서 삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}
