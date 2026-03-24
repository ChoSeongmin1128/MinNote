import type { BlockTintPreset } from './types';

export const BLOCK_TINT_PRESETS: Array<{
  id: BlockTintPreset;
  label: string;
  oddColor: string;
  evenColor: string;
}> = [
  { id: 'mist', label: 'Mist', oddColor: '#7f8ca4', evenColor: '#a8b4c7' },
  { id: 'sage-rose', label: 'Sage / Rose', oddColor: '#7fa08f', evenColor: '#b38d97' },
  { id: 'sky-amber', label: 'Sky / Amber', oddColor: '#7ca3c0', evenColor: '#c69a58' },
  { id: 'mint-plum', label: 'Mint / Plum', oddColor: '#79ae9c', evenColor: '#987da1' },
  { id: 'ocean-sand', label: 'Ocean / Sand', oddColor: '#628ca4', evenColor: '#b6a282' },
  { id: 'violet-lime', label: 'Violet / Lime', oddColor: '#8977b4', evenColor: '#96ab67' },
];

export const DEFAULT_BLOCK_TINT_PRESET: BlockTintPreset = 'mist';
