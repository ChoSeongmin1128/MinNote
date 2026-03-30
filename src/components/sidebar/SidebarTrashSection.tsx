import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DocumentSummaryVm } from '../../application/models/document';
import { getVisibleDocumentTitle } from '../../lib/documentTitle';

interface SidebarTrashSectionProps {
  documents: DocumentSummaryVm[];
  onEmptyTrash: () => void;
  onRestoreDocument: (documentId: string) => void;
}

export function SidebarTrashSection({
  documents,
  onEmptyTrash,
  onRestoreDocument,
}: SidebarTrashSectionProps) {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="trash-section">
      <div className="trash-section-header">
        <span>휴지통</span>
        {confirmEmptyTrash ? (
          <div className="trash-empty-header-actions">
            <span className="trash-empty-confirm-label">정말 비울까요?</span>
            <button
              className="ghost-button trash-empty-cancel"
              type="button"
              onClick={() => setConfirmEmptyTrash(false)}
            >
              취소
            </button>
            <button
              className="ghost-button trash-empty-confirm"
              type="button"
              onClick={() => {
                setConfirmEmptyTrash(false);
                onEmptyTrash();
              }}
            >
              비우기
            </button>
          </div>
        ) : (
          <button
            className="ghost-button trash-empty-header-button"
            type="button"
            onClick={() => setConfirmEmptyTrash(true)}
          >
            <Trash2 size={12} />
            <span>휴지통 비우기</span>
          </button>
        )}
      </div>
      {documents.map((document) => (
        <div key={document.id} className="trash-card">
          <div className="trash-card-info">
            <span className="trash-card-title">{getVisibleDocumentTitle(document.title)}</span>
          </div>
          <button
            className="icon-button trash-restore-button"
            type="button"
            aria-label="복원"
            onClick={() => onRestoreDocument(document.id)}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
