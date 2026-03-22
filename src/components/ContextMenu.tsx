import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ContextMenuItem =
  | {
      type?: 'action';
      id: string;
      label: string;
      icon?: ReactNode;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
    }
  | {
      type: 'separator';
      id: string;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onAction: (id: string) => void | Promise<void>;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onAction, onClose }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const actionItems = useMemo(
    () => items.filter((item): item is Exclude<ContextMenuItem, { type: 'separator' }> => item.type !== 'separator'),
    [items],
  );
  const [selectedId, setSelectedId] = useState(actionItems.find((item) => !item.disabled)?.id ?? null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = rootRef.current;
    if (!menu) return;
    const left = Math.min(x, window.innerWidth - menu.offsetWidth - 8);
    const top = Math.min(y, window.innerHeight - menu.offsetHeight - 8);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  const selectedAction = actionItems.find((item) => item.id === selectedId) ?? null;

  return createPortal(
    <div
      ref={rootRef}
      className="app-context-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const enabledItems = actionItems.filter((item) => !item.disabled);
          if (enabledItems.length === 0) {
            return;
          }
          const currentIndex = Math.max(
            0,
            enabledItems.findIndex((item) => item.id === selectedId),
          );
          const next = enabledItems[(currentIndex + 1) % enabledItems.length];
          setSelectedId(next.id);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          const enabledItems = actionItems.filter((item) => !item.disabled);
          if (enabledItems.length === 0) {
            return;
          }
          const currentIndex = Math.max(
            0,
            enabledItems.findIndex((item) => item.id === selectedId),
          );
          const next = enabledItems[(currentIndex - 1 + enabledItems.length) % enabledItems.length];
          setSelectedId(next.id);
          return;
        }

        if (event.key === 'Enter' && selectedAction && !selectedAction.disabled) {
          event.preventDefault();
          void onAction(selectedAction.id);
          onClose();
        }
      }}
    >
      {items.map((item) =>
        item.type === 'separator' ? (
          <div key={item.id} className="app-context-menu-separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`app-context-menu-item${item.id === selectedId ? ' is-active' : ''}${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onMouseEnter={() => !item.disabled && setSelectedId(item.id)}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              void onAction(item.id);
              onClose();
            }}
          >
            <span className="row">
              {item.icon ?? <span className="app-context-menu-icon-placeholder" />}
              <span>{item.label}</span>
            </span>
            {item.checked ? <Check size={14} /> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
