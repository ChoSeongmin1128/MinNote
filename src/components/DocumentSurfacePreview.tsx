import type { CSSProperties } from 'react';
import { DOCUMENT_SURFACE_TONE_PRESETS } from '../lib/documentSurfaceTone';
import type { DocumentSurfaceTonePreset } from '../lib/types';

interface DocumentSurfacePreviewProps {
  preset: DocumentSurfaceTonePreset;
  className?: string;
  variant?: 'blocks' | 'surface';
}

export function DocumentSurfacePreview({
  preset,
  className,
  variant = 'blocks',
}: DocumentSurfacePreviewProps) {
  const surfacePreset = DOCUMENT_SURFACE_TONE_PRESETS.find((entry) => entry.id === preset);

  if (!surfacePreset) {
    return null;
  }

  return (
    <span
      className={`document-menu-option-preview document-surface-tone-preview${className ? ` ${className}` : ''}`}
      data-preview-variant={variant}
      data-preset={preset}
      style={
        {
          '--preview-surface-light': surfacePreset.lightColor,
          '--preview-surface-dark': surfacePreset.darkColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {variant === 'surface' ? (
        <span className="document-menu-option-preview-surface-chip">
          <span className="document-menu-option-preview-surface-line" />
          <span className="document-menu-option-preview-surface-line is-short" />
        </span>
      ) : (
        <span className="document-menu-option-preview-stack">
          <span className="document-menu-option-preview-block is-surface">
            <span className="document-menu-option-preview-row is-surface" />
            <span className="document-menu-option-preview-row is-surface is-short" />
          </span>
          <span className="document-menu-option-preview-block is-surface is-alt">
            <span className="document-menu-option-preview-row is-surface is-alt" />
            <span className="document-menu-option-preview-row is-surface is-alt is-short" />
          </span>
          <span className="document-menu-option-preview-block is-surface">
            <span className="document-menu-option-preview-row is-surface" />
            <span className="document-menu-option-preview-row is-surface is-short" />
          </span>
        </span>
      )}
    </span>
  );
}
