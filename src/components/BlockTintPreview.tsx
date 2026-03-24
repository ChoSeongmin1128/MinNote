import type { CSSProperties } from 'react';
import { BLOCK_TINT_PRESETS } from '../lib/blockTint';
import type { BlockTintPreset } from '../lib/types';

interface BlockTintPreviewProps {
  preset: BlockTintPreset;
  className?: string;
}

export function BlockTintPreview({ preset, className }: BlockTintPreviewProps) {
  const tintPreset = BLOCK_TINT_PRESETS.find((entry) => entry.id === preset);

  if (!tintPreset) {
    return null;
  }

  return (
    <span
      className={`document-menu-option-preview${className ? ` ${className}` : ''}`}
      data-preset={preset}
      style={
        {
          '--preview-tint-odd': tintPreset.oddColor,
          '--preview-tint-even': tintPreset.evenColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="document-menu-option-preview-stack">
        <span className="document-menu-option-preview-block">
          <span className="document-menu-option-preview-row" />
          <span className="document-menu-option-preview-row is-short" />
        </span>
        <span className="document-menu-option-preview-block is-alt">
          <span className="document-menu-option-preview-row is-alt" />
          <span className="document-menu-option-preview-row is-alt is-short" />
        </span>
        <span className="document-menu-option-preview-block">
          <span className="document-menu-option-preview-row" />
          <span className="document-menu-option-preview-row is-short" />
        </span>
      </span>
    </span>
  );
}
