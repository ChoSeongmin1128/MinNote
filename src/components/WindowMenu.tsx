import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePreferencesController } from '../app/controllers';
import {
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
} from '../lib/globalShortcut';
import { useWindowOpacityControl } from '../hooks/useWindowOpacityControl';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function WindowMenu() {
  const { setAlwaysOnTopEnabled } = usePreferencesController();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const alwaysOnTopEnabled = useWorkspaceStore((state) => state.alwaysOnTopEnabled);
  const { draftOpacity, previewOpacity, commitOpacity } = useWindowOpacityControl();

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

  return (
    <div className="window-menu" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        aria-label="앱 창 메뉴"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} />
      </button>

      {isOpen ? (
        <div className="window-menu-popover" role="menu">
          <label className="window-menu-toggle" htmlFor="always-on-top-toggle">
            <span>항상 위에 고정</span>
            <input
              id="always-on-top-toggle"
              type="checkbox"
              checked={alwaysOnTopEnabled}
              onChange={(event) => {
                void setAlwaysOnTopEnabled(event.target.checked);
              }}
            />
          </label>

          <div className="window-menu-slider">
            <div className="window-menu-slider-header">
              <div className="window-menu-slider-title-group">
                <span className="document-menu-label">투명도</span>
                <span className="document-menu-status">{draftOpacity}%</span>
              </div>
              <button
                className="ghost-button window-menu-inline-action"
                type="button"
                disabled={draftOpacity === MAX_WINDOW_OPACITY_PERCENT}
                onClick={() => {
                  void commitOpacity(MAX_WINDOW_OPACITY_PERCENT);
                }}
              >
                100%로 복원
              </button>
            </div>
            <input
              className="opacity-slider"
              type="range"
              min={MIN_WINDOW_OPACITY_PERCENT}
              max={MAX_WINDOW_OPACITY_PERCENT}
              step={1}
              value={draftOpacity}
              onInput={(event) => {
                void previewOpacity(Number(event.currentTarget.value));
              }}
              onPointerUp={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
              onKeyUp={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
              onBlur={(event) => {
                void commitOpacity(Number(event.currentTarget.value));
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
