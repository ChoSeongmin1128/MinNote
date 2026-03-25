import { Keyboard } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_GLOBAL_TOGGLE_SHORTCUT,
  formatShortcutDisplay,
  keyboardEventToAccelerator,
} from '../lib/globalShortcut';

interface ShortcutCaptureFieldProps {
  value: string | null;
  error: string | null;
  onCommit: (shortcut: string | null) => Promise<unknown>;
}

export function ShortcutCaptureField({ value, error, onCommit }: ShortcutCaptureFieldProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const mergedError = localError ?? error;
  const displayValue = useMemo(() => formatShortcutDisplay(value), [value]);

  useEffect(() => {
    if (!isCapturing) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsCapturing(false);
        setLocalError(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const accelerator = keyboardEventToAccelerator(event);
      if (!accelerator) {
        setLocalError('보조키와 일반 키를 함께 눌러 주세요.');
        return;
      }

      setIsCapturing(false);
      setLocalError(null);
      setIsSaving(true);
      void onCommit(accelerator)
        .catch((commitError) => {
          const message =
            commitError instanceof Error
              ? commitError.message
              : '전역 단축키를 저장하지 못했습니다.';
          setLocalError(message);
        })
        .finally(() => {
          setIsSaving(false);
        });
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isCapturing, onCommit]);

  return (
    <div className="shortcut-capture">
      <div className="shortcut-capture-row">
        <div className="shortcut-capture-value" aria-live="polite">
          <Keyboard size={14} />
          <span>{isCapturing ? '새 단축키 입력 중…' : displayValue}</span>
        </div>
        <div className="shortcut-capture-actions">
          <button
            className="ghost-button"
            type="button"
            disabled={isSaving}
            onClick={() => {
              setLocalError(null);
              setIsCapturing((capturing) => !capturing);
            }}
          >
            {isCapturing ? '취소' : '입력'}
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={isSaving || value === DEFAULT_GLOBAL_TOGGLE_SHORTCUT}
            onClick={() => {
              setLocalError(null);
              setIsSaving(true);
              void onCommit(DEFAULT_GLOBAL_TOGGLE_SHORTCUT)
                .catch((commitError) => {
                  const message =
                    commitError instanceof Error
                      ? commitError.message
                      : '기본 단축키를 복원하지 못했습니다.';
                  setLocalError(message);
                })
                .finally(() => {
                  setIsSaving(false);
                });
            }}
          >
            기본값
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={isSaving || value == null}
            onClick={() => {
              setLocalError(null);
              setIsSaving(true);
              void onCommit(null)
                .catch((commitError) => {
                  const message =
                    commitError instanceof Error
                      ? commitError.message
                      : '전역 단축키를 비활성화하지 못했습니다.';
                  setLocalError(message);
                })
                .finally(() => {
                  setIsSaving(false);
                });
            }}
          >
            비활성화
          </button>
        </div>
      </div>
      <span className="shortcut-capture-hint">
        {isCapturing
          ? '보조키와 함께 원하는 키를 누르세요. Esc로 취소할 수 있습니다.'
          : '전역 단축키는 앱이 실행 중일 때만 창 숨김/표시를 토글합니다.'}
      </span>
      {mergedError ? <span className="shortcut-capture-error">{mergedError}</span> : null}
    </div>
  );
}
