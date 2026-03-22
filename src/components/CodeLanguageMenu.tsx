import { createPortal } from 'react-dom';
import { Braces, Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CODE_LANGUAGE_OPTIONS, normalizeCodeLanguage, type CodeLanguageId } from '../lib/blockOptions';

interface CodeLanguageMenuProps {
  anchorRect: DOMRect;
  value: string | null;
  onSelect: (language: CodeLanguageId) => void;
  onClose: () => void;
}

function CodeLanguageMenu({ anchorRect, value, onSelect, onClose }: CodeLanguageMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentLanguage = normalizeCodeLanguage(value);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const visibleOptions = useMemo(
    () => CODE_LANGUAGE_OPTIONS.filter((option) => !('hidden' in option && option.hidden)),
    [],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleOptions;
    const q = query.toLowerCase();
    return visibleOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.id.toLowerCase().includes(q),
    );
  }, [query, visibleOptions]);

  useLayoutEffect(() => {
    const menu = rootRef.current;
    if (!menu) return;

    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
    const spaceAbove = anchorRect.top - 8;

    let top: number;
    if (spaceBelow >= menuHeight) {
      top = anchorRect.bottom + 4;
    } else if (spaceAbove >= menuHeight) {
      top = anchorRect.top - menuHeight - 4;
    } else {
      top = Math.max(8, window.innerHeight - menuHeight - 8);
    }

    const left = Math.min(anchorRect.right, window.innerWidth - menu.offsetWidth - 8);
    setPosition({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  useEffect(() => {
    const active = listRef.current?.querySelector('.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectedOption = filtered[selectedIndex] ?? filtered[0];

  return createPortal(
    <div
      ref={rootRef}
      className="code-language-menu"
      role="menu"
      tabIndex={-1}
      style={{ top: position.top, left: position.left }}
    >
      <div className="code-language-search">
        <Search size={13} />
        <input
          ref={inputRef}
          type="text"
          placeholder="언어 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
              return;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1));
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedIndex((index) => Math.max(index - 1, 0));
              return;
            }

            if (event.key === 'Enter' && selectedOption) {
              event.preventDefault();
              onSelect(selectedOption.id);
            }
          }}
        />
      </div>
      <div ref={listRef} className="code-language-list">
        {filtered.length === 0 ? (
          <span className="code-language-empty">결과 없음</span>
        ) : (
          filtered.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={selectedIndex === index ? 'is-active' : ''}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => onSelect(option.id)}
            >
              <span className="row">
                <Braces size={14} />
                <span>{option.label}</span>
              </span>
              {currentLanguage === option.id ? <Check size={14} /> : null}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

interface CodeLanguageTriggerProps {
  value: string | null;
  isVisible: boolean;
  onSelect: (language: CodeLanguageId) => void;
}

export function CodeLanguageTrigger({ value, isVisible, onSelect }: CodeLanguageTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const currentLanguage = normalizeCodeLanguage(value);
  const label = CODE_LANGUAGE_OPTIONS.find((option) => option.id === currentLanguage)?.label ?? 'Plain Text';

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchorRect(rect);
      setIsOpen(true);
    }
  };

  return (
    <div className={`code-language-anchor${isVisible ? ' is-visible' : ''}${isOpen ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        className="code-language-trigger"
        type="button"
        aria-label="코드 언어 선택"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <span>{label}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && anchorRect ? (
        <CodeLanguageMenu
          anchorRect={anchorRect}
          value={currentLanguage}
          onClose={() => setIsOpen(false)}
          onSelect={(language) => {
            setIsOpen(false);
            onSelect(language);
          }}
        />
      ) : null}
    </div>
  );
}
