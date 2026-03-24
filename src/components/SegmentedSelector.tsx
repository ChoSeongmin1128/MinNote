import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControls,
} from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface SegmentedSelectorOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  disabled?: boolean;
}

interface SegmentedSelectorProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: readonly SegmentedSelectorOption<T>[];
  onChange: (value: T) => void | Promise<void>;
  layout?: 'inline' | 'palette';
  motionStyle?: 'liquid' | 'subtle';
  columns?: number;
  disabled?: boolean;
  renderOption?: (
    option: SegmentedSelectorOption<T>,
    meta: { isSelected: boolean },
  ) => ReactNode;
}

interface ThumbRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampIndex(index: number, length: number) {
  if (length === 0) return 0;
  if (index < 0) return length - 1;
  if (index >= length) return 0;
  return index;
}

function maxAbs(value: number, floor: number) {
  return Math.max(Math.abs(value), floor);
}

export function SegmentedSelector<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  layout = 'inline',
  motionStyle = 'liquid',
  columns = 3,
  disabled = false,
  renderOption,
}: SegmentedSelectorProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const controlsRef = useRef<AnimationPlaybackControls[]>([]);
  const isAnimatingRef = useRef(false);
  const requestTokenRef = useRef(0);
  const [visualValue, setVisualValue] = useState(value);
  const [hasThumb, setHasThumb] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('center center');
  const isPalette = layout === 'palette';
  const isSubtle = motionStyle === 'subtle';
  const lastPropValueRef = useRef(value);

  const thumbX = useMotionValue(0);
  const thumbY = useMotionValue(0);
  const thumbWidth = useMotionValue(0);
  const thumbHeight = useMotionValue(0);
  const thumbScaleX = useMotionValue(1);
  const thumbScaleY = useMotionValue(1);
  const thumbRotate = useMotionValue(0);
  const thumbBlur = useMotionValue(0);
  const thumbGlow = useMotionValue(0);
  const thumbShift = useMotionValue(0);
  const thumbBrightness = useMotionValue(0);
  const thumbTintOpacity = useMotionValue(0);
  const thumbHighlightOpacity = useMotionValue(0);
  const thumbShadowOpacity = useMotionValue(0);
  const thumbRadius = useMotionValue(isPalette ? 16 : 13);

  const blurPx = useMotionTemplate`${thumbBlur}px`;
  const shiftPx = useMotionTemplate`${thumbShift}px`;
  const rotateDeg = useMotionTemplate`${thumbRotate}deg`;

  const enabledOptions = useMemo(
    () => options.filter((option) => !option.disabled),
    [options],
  );

  const stopAnimations = useCallback(() => {
    controlsRef.current.forEach((control) => control.stop());
    controlsRef.current = [];
  }, []);

  const resetLiquid = useCallback(() => {
    thumbScaleX.set(1);
    thumbScaleY.set(1);
    thumbRotate.set(0);
    thumbBlur.set(0);
    thumbGlow.set(0);
    thumbShift.set(0);
    thumbBrightness.set(0);
    thumbTintOpacity.set(0);
    thumbHighlightOpacity.set(0);
    thumbShadowOpacity.set(0);
    thumbRadius.set(isPalette ? 16 : 13);
  }, [
    isPalette,
    thumbBlur,
    thumbBrightness,
    thumbGlow,
    thumbHighlightOpacity,
    thumbRadius,
    thumbRotate,
    thumbScaleX,
    thumbScaleY,
    thumbShadowOpacity,
    thumbShift,
    thumbTintOpacity,
  ]);

  const applyThumbRect = useCallback((rect: ThumbRect) => {
    thumbX.set(rect.x);
    thumbY.set(rect.y);
    thumbWidth.set(rect.width);
    thumbHeight.set(rect.height);
    setHasThumb(true);
  }, [thumbHeight, thumbWidth, thumbX, thumbY]);

  const measureOptionRect = useCallback((optionValue: T) => {
    const groupElement = groupRef.current;
    const optionElement = optionRefs.current.get(optionValue);

    if (!groupElement || !optionElement) {
      return null;
    }

    const groupRect = groupElement.getBoundingClientRect();
    const optionRect = optionElement.getBoundingClientRect();

    return {
      x: optionRect.left - groupRect.left,
      y: optionRect.top - groupRect.top,
      width: optionRect.width,
      height: optionRect.height,
    };
  }, []);

  const updateLiquidFrame = useCallback((progress: number, fromRect: ThumbRect, toRect: ThumbRect) => {
    const deltaX = toRect.x - fromRect.x;
    const deltaY = toRect.y - fromRect.y;
    const distance = Math.hypot(deltaX, deltaY);
    const normalizedDistance = Math.min(distance / (isPalette ? 220 : 140), 1);
    const envelope = Math.sin(progress * Math.PI);
    const rebound = Math.sin(progress * Math.PI * 0.7);
    const horizontalBias = distance === 0 ? 0 : deltaX / distance;
    const verticalBias = distance === 0 ? 0 : deltaY / distance;
    const dominantX = maxAbs(horizontalBias, 0.35);
    const dominantY = maxAbs(verticalBias, 0.16);
    const motionFactor = isSubtle ? 0.42 : 1;
    const expansion = (0.08 + normalizedDistance * (isPalette ? 0.08 : 0.12)) * motionFactor;
    const flatten = (0.03 + normalizedDistance * 0.02) * motionFactor;
    const directionalShift = (12 + normalizedDistance * 18) * envelope * motionFactor;

    thumbScaleX.set(1 + expansion * dominantX * envelope);
    thumbScaleY.set(1 + (dominantY * 0.05 + flatten) * rebound);
    thumbRotate.set((horizontalBias * 1.5 + verticalBias * 0.8) * envelope * motionFactor);
    thumbShift.set(horizontalBias * directionalShift);
    thumbBlur.set((1.6 + envelope * (6 + normalizedDistance * 5)) * motionFactor);
    thumbGlow.set((0.1 + envelope * (0.18 + normalizedDistance * 0.18)) * motionFactor);
    thumbBrightness.set((0.01 + envelope * (0.03 + normalizedDistance * 0.05)) * motionFactor);
    thumbTintOpacity.set((0.05 + envelope * (0.12 + normalizedDistance * 0.12)) * motionFactor);
    thumbHighlightOpacity.set((0.12 + envelope * (0.2 + normalizedDistance * 0.16)) * motionFactor);
    thumbShadowOpacity.set((0.08 + envelope * (0.12 + normalizedDistance * 0.12)) * motionFactor);
    thumbRadius.set((isPalette ? 16 : 13) + envelope * (isPalette ? 5 : 3) * motionFactor);
  }, [
    isPalette,
    isSubtle,
    thumbBlur,
    thumbBrightness,
    thumbGlow,
    thumbHighlightOpacity,
    thumbRadius,
    thumbRotate,
    thumbScaleX,
    thumbScaleY,
    thumbShadowOpacity,
    thumbShift,
    thumbTintOpacity,
  ]);

  const animateThumb = useCallback((fromRect: ThumbRect | null, toRect: ThumbRect | null) => {
    if (!toRect) {
      return;
    }

    stopAnimations();

    if (!fromRect) {
      applyThumbRect(toRect);
      resetLiquid();
      setIsAnimating(false);
      isAnimatingRef.current = false;
      return;
    }

    setHasThumb(true);
    setTransformOrigin(toRect.x >= fromRect.x ? 'left center' : 'right center');
    setIsAnimating(true);
    isAnimatingRef.current = true;

    controlsRef.current = [
      animate(thumbX, toRect.x, { type: 'spring', stiffness: 420, damping: 32, mass: 0.88 }),
      animate(thumbY, toRect.y, { type: 'spring', stiffness: 420, damping: 32, mass: 0.88 }),
      animate(thumbWidth, toRect.width, { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }),
      animate(thumbHeight, toRect.height, { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }),
      animate(0, 1, {
        duration: isSubtle ? 0.28 : 0.42,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (progress) => {
          updateLiquidFrame(progress, fromRect, toRect);
        },
        onComplete: () => {
          resetLiquid();
          setIsAnimating(false);
          isAnimatingRef.current = false;
        },
      }),
    ];
  }, [
    applyThumbRect,
    isSubtle,
    resetLiquid,
    stopAnimations,
    thumbHeight,
    thumbWidth,
    thumbX,
    thumbY,
    updateLiquidFrame,
  ]);

  useEffect(() => {
    if (value === lastPropValueRef.current) {
      return;
    }

    lastPropValueRef.current = value;
    const fromRect = measureOptionRect(visualValue);
    const toRect = measureOptionRect(value);

    setVisualValue(value);
    animateThumb(fromRect, toRect);
  }, [animateThumb, measureOptionRect, value, visualValue]);

  useLayoutEffect(() => {
    const rect = measureOptionRect(visualValue);
    if (!rect) {
      return;
    }

    if (!isAnimatingRef.current) {
      applyThumbRect(rect);
      resetLiquid();
    }
  }, [applyThumbRect, columns, layout, measureOptionRect, options, resetLiquid, visualValue]);

  useEffect(() => {
    let frameId = 0;

    const syncRect = () => {
      const rect = measureOptionRect(visualValue);
      if (!rect || isAnimatingRef.current) {
        return;
      }
      applyThumbRect(rect);
    };

    const scheduleSync = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(syncRect);
    };

    scheduleSync();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleSync);
      return () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', scheduleSync);
      };
    }

    const observer = new ResizeObserver(scheduleSync);
    const groupElement = groupRef.current;

    if (groupElement) {
      observer.observe(groupElement);
    }

    optionRefs.current.forEach((optionElement) => {
      observer.observe(optionElement);
    });

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [applyThumbRect, measureOptionRect, options, visualValue]);

  useEffect(() => () => {
    stopAnimations();
  }, [stopAnimations]);

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
      if (disabled || nextValue === visualValue) {
        return;
      }

      const option = options.find((entry) => entry.value === nextValue);
      if (!option || option.disabled) {
        return;
      }

      const previousValue = visualValue;
      const previousRect = measureOptionRect(previousValue);
      const nextRect = measureOptionRect(nextValue);

      setVisualValue(nextValue);
      animateThumb(previousRect, nextRect);

      const requestToken = ++requestTokenRef.current;

      Promise.resolve(onChange(nextValue)).catch(() => {
        if (requestToken !== requestTokenRef.current) {
          return;
        }

        const revertedFromRect = measureOptionRect(nextValue) ?? nextRect;
        const revertedToRect = measureOptionRect(previousValue) ?? previousRect;
        setVisualValue(previousValue);
        animateThumb(revertedFromRect, revertedToRect);
      });
    },
    [animateThumb, disabled, measureOptionRect, onChange, options, visualValue],
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
      className={`segmented-selector${isPalette ? ' is-palette' : ' is-inline'}${disabled ? ' is-disabled' : ''}${isSubtle ? ' is-subtle' : ''}`}
      role="radiogroup"
      style={{ '--segmented-columns': columns } as CSSProperties}
    >
      {hasThumb ? (
        <motion.div
          aria-hidden="true"
          className={`segmented-selector-thumb${isAnimating ? ' is-animating' : ''}${isPalette ? ' is-palette' : ''}${isSubtle ? ' is-subtle' : ''}`}
          style={{
            x: thumbX,
            y: thumbY,
            width: thumbWidth,
            height: thumbHeight,
            scaleX: thumbScaleX,
            scaleY: thumbScaleY,
            rotate: thumbRotate,
            borderRadius: thumbRadius,
            transformOrigin,
            '--liquid-blur': blurPx,
            '--liquid-glow': thumbGlow,
            '--liquid-shift': shiftPx,
            '--liquid-rotate': rotateDeg,
            '--liquid-brightness': thumbBrightness,
            '--liquid-tint-opacity': thumbTintOpacity,
            '--liquid-highlight-opacity': thumbHighlightOpacity,
            '--liquid-shadow-opacity': thumbShadowOpacity,
          } as unknown as CSSProperties}
        >
          <span className="segmented-selector-thumb-tint" />
          <span className="segmented-selector-thumb-highlight" />
        </motion.div>
      ) : null}

      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = visualValue === option.value;
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
