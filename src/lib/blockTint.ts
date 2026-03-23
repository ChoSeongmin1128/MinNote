import type { BlockTintPreset } from './types';

export const BLOCK_TINT_PRESETS: Array<{
  id: BlockTintPreset;
  label: string;
}> = [
  { id: 'mist', label: 'Mist' },
  { id: 'sage-rose', label: 'Sage / Rose' },
  { id: 'sky-amber', label: 'Sky / Amber' },
  { id: 'mint-plum', label: 'Mint / Plum' },
  { id: 'ocean-sand', label: 'Ocean / Sand' },
  { id: 'violet-lime', label: 'Violet / Lime' },
];

export const DEFAULT_BLOCK_TINT_PRESET: BlockTintPreset = 'mist';
