import type { ComponentType, ReactNode } from 'react';

export interface SegmentedSelectorOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  disabled?: boolean;
}

export interface ThumbRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampIndex(index: number, length: number) {
  if (length === 0) return 0;
  if (index < 0) return length - 1;
  if (index >= length) return 0;
  return index;
}

export function maxAbs(value: number, floor: number) {
  return Math.max(Math.abs(value), floor);
}

export interface SegmentedSelectorRenderOptionMeta {
  isSelected: boolean;
}

export type SegmentedSelectorRenderOption<T extends string> = (
  option: SegmentedSelectorOption<T>,
  meta: SegmentedSelectorRenderOptionMeta,
) => ReactNode;
