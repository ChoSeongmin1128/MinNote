import {
  motion,
} from 'framer-motion';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  clampIndex,
  type SegmentedSelectorOption,
  type SegmentedSelectorRenderOption,
} from './segmentedSelector/shared';
import { useSegmentedSelectorThumb } from './segmentedSelector/useSegmentedSelectorThumb';

interface SegmentedSelectorProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: readonly SegmentedSelectorOption<T>[];
  onChange: (value: T) => void | Promise<void>;
  layout?: 'inline' | 'palette';
  tone?: 'settings' | 'popover';
  motionStyle?: 'liquid' | 'subtle';
  columns?: number;
  disabled?: boolean;
  renderOption?: SegmentedSelectorRenderOption<T>;
}

export function SegmentedSelector<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  layout = 'inline',
  tone = 'settings',
  motionStyle = 'liquid',
  columns = 3,
  disabled = false,
  renderOption,
}: SegmentedSelectorProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const [pendingValue, setPendingValue] = useState<T | null>(null);
  const isPalette = layout === 'palette';
  const isSubtle = motionStyle === 'subtle';
  const toneClassName = tone === 'popover' ? ' is-popover' : ' is-settings';
  const lastPropValueRef = useRef(value);
  const displayValue = pendingValue ?? value;

  const enabledOptions = useMemo(
    () => options.filter((option) => !option.disabled),
    [options],
  );
  const {
    animateThumb,
    hasThumb,
    isAnimating,
    measureOptionRect,
    thumbStyle,
  } = useSegmentedSelectorThumb({
    groupRef,
    optionRefs,
    selectedValue: displayValue,
    isPalette,
    isSubtle,
    columns,
    layout,
    options,
  });

  useEffect(() => {
    if (value === lastPropValueRef.current) {
      return;
    }

    const fromValue = lastPropValueRef.current;
    lastPropValueRef.current = value;
    const fromRect = measureOptionRect(fromValue);
    const toRect = measureOptionRect(value);
    animateThumb(fromRect, toRect);
    if (pendingValue !== null) {
      queueMicrotask(() => {
        setPendingValue(null);
      });
    }
  }, [animateThumb, measureOptionRect, pendingValue, value]);

  const setOptionRef = useCallback(
    (optionValue: T) => (node: HTMLButtonElement | null) => {
      if (node) {
        optionRefs.current.set(optionValue, node);
        return;
      }

      optionRefs.current.delete(optionValue);
    },
    [],
  );

  const selectValue = useCallback(
    (nextValue: T) => {
      if (disabled || nextValue === displayValue) {
        return;
      }

      const option = options.find((entry) => entry.value === nextValue);
      if (!option || option.disabled) {
        return;
      }

      const nextRect = measureOptionRect(nextValue);
      const currentRect = measureOptionRect(displayValue);

      setPendingValue(nextValue);
      animateThumb(currentRect, nextRect);
      void Promise.resolve(onChange(nextValue)).catch(() => {
        setPendingValue(null);
        // Parent state is source of truth; a failed change should leave the selector on the current prop value.
      });
    },
    [animateThumb, disabled, displayValue, measureOptionRect, onChange, options],
  );

  const moveFocus = useCallback(
    (currentValue: T, direction: 'next' | 'prev' | 'up' | 'down') => {
      const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue);
      if (currentIndex === -1) {
        return;
      }

      let nextIndex = currentIndex;
      if (direction === 'next') nextIndex = currentIndex + 1;
      if (direction === 'prev') nextIndex = currentIndex - 1;
      if (direction === 'up') nextIndex = currentIndex - columns;
      if (direction === 'down') nextIndex = currentIndex + columns;

      const wrappedIndex = clampIndex(nextIndex, enabledOptions.length);
      const nextOption = enabledOptions[wrappedIndex];
      if (!nextOption) {
        return;
      }

      optionRefs.current.get(nextOption.value)?.focus();
      selectValue(nextOption.value);
    },
    [columns, enabledOptions, selectValue],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, optionValue: T) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectValue(optionValue);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const firstOption = enabledOptions[0];
      if (firstOption) {
        optionRefs.current.get(firstOption.value)?.focus();
        selectValue(firstOption.value);
      }
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const lastOption = enabledOptions[enabledOptions.length - 1];
      if (lastOption) {
        optionRefs.current.get(lastOption.value)?.focus();
        selectValue(lastOption.value);
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(optionValue, 'next');
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(optionValue, 'prev');
      return;
    }

    if (isPalette && event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(optionValue, 'down');
      return;
    }

    if (isPalette && event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(optionValue, 'up');
    }
  };

  return (
    <div
      ref={groupRef}
      aria-label={ariaLabel}
      className={`segmented-selector${isPalette ? ' is-palette' : ' is-inline'}${toneClassName}${disabled ? ' is-disabled' : ''}${isSubtle ? ' is-subtle' : ''}`}
      role="radiogroup"
      style={{ '--segmented-columns': columns } as CSSProperties}
    >
      {hasThumb ? (
        <motion.div
          aria-hidden="true"
          className={`segmented-selector-thumb${isAnimating ? ' is-animating' : ''}${isPalette ? ' is-palette' : ''}${toneClassName}${isSubtle ? ' is-subtle' : ''}`}
          style={thumbStyle}
        >
          <span className="segmented-selector-thumb-tint" />
          <span className="segmented-selector-thumb-highlight" />
        </motion.div>
      ) : null}

      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = displayValue === option.value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <button
            key={option.value}
            ref={setOptionRef(option.value)}
            aria-checked={isSelected}
            className={`segmented-selector-option${isSelected ? ' is-selected' : ''}${isOptionDisabled ? ' is-disabled' : ''}`}
            role="radio"
            tabIndex={isSelected ? 0 : -1}
            type="button"
            disabled={isOptionDisabled}
            onClick={() => selectValue(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
          >
            <span className="segmented-selector-option-content">
              {renderOption ? (
                renderOption(option, { isSelected })
              ) : (
                <>
                  {Icon ? <Icon size={14} /> : null}
                  <span>{option.label}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
