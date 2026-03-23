import { Check, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BlockTintPreview } from './BlockTintPreview';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import { deleteDocument, setDocumentBlockTintOverride } from '../controllers/appController';
import { useDocumentSessionStore } from '../stores/documentSessionStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function DocumentMenu() {
  const currentDocument = useDocumentSessionStore((state) => state.currentDocument);
  const defaultBlockTintPreset = useWorkspaceStore((state) => state.defaultBlockTintPreset);
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
              <button
                className={`document-menu-toggle${isFollowingDefault ? ' is-active' : ''}`}
                type="button"
                aria-pressed={isFollowingDefault}
                onClick={() => {
                  if (isFollowingDefault) {
                    void setDocumentBlockTintOverride(defaultBlockTintPreset);
                    return;
                  }

                  void setDocumentBlockTintOverride(null);
                }}
              >
                기본값 사용
              </button>
            </div>
            <span className="document-menu-status">
              {isFollowingDefault
                ? `현재 전역 기본값 ${BLOCK_TINT_PRESETS.find((preset) => preset.id === defaultBlockTintPreset)?.label ?? ''}을 추종 중`
                : '문서 전용 색상쌍을 사용 중'}
            </span>
            <div className="document-menu-options">
              {BLOCK_TINT_PRESETS.map((preset) => {
                const isGlobalDefault = defaultBlockTintPreset === preset.id;
                const isActive = selectedPreset === preset.id;

                return (
                  <button
                    key={preset.id}
                    className={`document-menu-option${isActive ? ' is-active' : ''}`}
                    type="button"
                    disabled={isFollowingDefault}
                    onClick={() => {
                      void setDocumentBlockTintOverride(preset.id);
                      setIsOpen(false);
                    }}
                  >
                    <BlockTintPreview preset={preset.id} />
                    <span className="document-menu-option-copy">
                      <span className="document-menu-option-title">
                        {preset.label}
                        {isGlobalDefault ? <span className="preset-badge">기본값</span> : null}
                      </span>
                      {isFollowingDefault && isGlobalDefault ? (
                        <span className="document-menu-option-description">현재 전역 기본값을 추종 중</span>
                      ) : null}
                    </span>
                    {isActive ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
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
