import {
  animate,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControls,
} from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { maxAbs, type ThumbRect } from './shared';

interface UseSegmentedSelectorThumbOptions<T extends string> {
  groupRef: React.RefObject<HTMLDivElement | null>;
  optionRefs: React.RefObject<Map<T, HTMLButtonElement>>;
  selectedValue: T;
  isPalette: boolean;
  isSubtle: boolean;
  columns: number;
  layout: 'inline' | 'palette';
  options: readonly { value: T }[];
}

export function useSegmentedSelectorThumb<T extends string>({
  groupRef,
  optionRefs,
  selectedValue,
  isPalette,
  isSubtle,
  columns,
  layout,
  options,
}: UseSegmentedSelectorThumbOptions<T>) {
  const controlsRef = useRef<AnimationPlaybackControls[]>([]);
  const isAnimatingRef = useRef(false);
  const [hasThumb, setHasThumb] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('center center');

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
  }, [groupRef, optionRefs]);

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

  useLayoutEffect(() => {
    const rect = measureOptionRect(selectedValue);
    if (!rect) {
      return;
    }

    if (!isAnimatingRef.current) {
      applyThumbRect(rect);
      resetLiquid();
    }
  }, [applyThumbRect, columns, layout, measureOptionRect, options, resetLiquid, selectedValue]);

  useEffect(() => {
    let frameId = 0;

    const syncRect = () => {
      const rect = measureOptionRect(selectedValue);
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
  }, [applyThumbRect, groupRef, measureOptionRect, optionRefs, options, selectedValue]);

  useEffect(() => () => {
    stopAnimations();
  }, [stopAnimations]);

  const thumbStyle = {
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
  } as unknown as CSSProperties;

  return {
    animateThumb,
    hasThumb,
    isAnimating,
    measureOptionRect,
    thumbStyle,
  };
}
