import type { DocumentSurfaceTonePreset } from './types';

export const DOCUMENT_SURFACE_TONE_PRESETS: Array<{
  id: DocumentSurfaceTonePreset;
  label: string;
  lightColor: string;
  darkColor: string;
}> = [
  { id: 'default', label: '기본', lightColor: '#f6f6f3', darkColor: '#121214' },
  { id: 'paper', label: 'Paper', lightColor: '#f5f2ea', darkColor: '#1f1b17' },
  { id: 'sand', label: 'Sand', lightColor: '#f1e7d8', darkColor: '#241d16' },
  { id: 'sage', label: 'Sage', lightColor: '#e7efe7', darkColor: '#18201a' },
  { id: 'slate', label: 'Slate', lightColor: '#e7ebf2', darkColor: '#151922' },
  { id: 'dusk', label: 'Dusk', lightColor: '#ece8f6', darkColor: '#1d1824' },
];

export const DEFAULT_DOCUMENT_SURFACE_TONE_PRESET: DocumentSurfaceTonePreset = 'default';
