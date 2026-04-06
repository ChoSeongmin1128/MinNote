import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DocumentSummaryVm } from '../../application/models/document';
import { getVisibleDocumentTitle } from '../../lib/documentTitle';

interface SidebarTrashSectionProps {
  documents: DocumentSummaryVm[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onEmptyTrash: () => void;
  onRestoreDocument: (documentId: string) => void;
}

export function SidebarTrashSection({
  documents,
  isExpanded,
  onToggleExpanded,
  onEmptyTrash,
  onRestoreDocument,
}: SidebarTrashSectionProps) {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const trashCount = documents.length;

  useEffect(() => {
    if (!isExpanded) {
      setConfirmEmptyTrash(false);
    }
  }, [isExpanded]);

  return (
    <div className="trash-section">
      <button
        className="trash-section-summary"
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggleExpanded}
      >
        <span className="trash-section-summary-copy">
          <span className="trash-section-summary-title">휴지통</span>
          <span className="trash-section-summary-count">
            {trashCount > 0 ? `${trashCount}개 문서` : '비어 있음'}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`trash-section-summary-chevron${isExpanded ? ' is-expanded' : ''}`}
        />
      </button>

      {isExpanded ? (
        <div className="trash-section-panel">
          {trashCount > 0 ? (
            <>
              <div className="trash-section-header">
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
            </>
          ) : (
            <div className="trash-empty-state">삭제된 문서가 없습니다</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
