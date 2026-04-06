import { Check, Circle, Cloud, LoaderCircle, Slash, TriangleAlert } from 'lucide-react';
import type { EditorStatusPresentation } from '../application/models/editorStatus';

interface EditorStatusProps {
  presentation: EditorStatusPresentation;
  notice?: string | null;
}

function CloudStatusBadge({ presentation }: Pick<EditorStatusProps, 'presentation'>) {
  const badge =
    presentation.cloudStatus === 'synced' ? (
      <Check size={9} strokeWidth={2.6} />
    ) : presentation.cloudStatus === 'syncing' ? (
      <LoaderCircle className="spin" size={9} strokeWidth={2.4} />
    ) : presentation.cloudStatus === 'pending' ? (
      <Circle size={7} fill="currentColor" strokeWidth={2.4} />
    ) : presentation.cloudStatus === 'warning' ? (
      <TriangleAlert size={9} strokeWidth={2.4} />
    ) : (
      <Slash size={9} strokeWidth={2.4} />
    );

  return (
    <span
      className={`cloud-sync-indicator is-${presentation.cloudStatus}`}
      title={presentation.cloudTooltip}
      aria-label={presentation.cloudTooltip}
    >
      <Cloud size={14} strokeWidth={2.1} />
      <span className="cloud-sync-indicator-badge">{badge}</span>
    </span>
  );
}

export function EditorStatus({ presentation, notice }: EditorStatusProps) {
  return (
    <span className="editor-status-group">
      <span className={`editor-status-label is-${presentation.saveStatus}`}>{presentation.saveLabel}</span>
      <CloudStatusBadge presentation={presentation} />
      {notice ? <span className="editor-status-note">{notice}</span> : null}
    </span>
  );
}
