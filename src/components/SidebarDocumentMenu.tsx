import { Trash2 } from 'lucide-react';
import { useDocumentController } from '../app/controllers';

interface SidebarDocumentMenuProps {
  documentId: string;
}

export function SidebarDocumentMenu({ documentId }: SidebarDocumentMenuProps) {
  const { deleteDocument } = useDocumentController();
  return (
    <button
      className="icon-button document-card-action is-danger"
      type="button"
      aria-label="문서 삭제"
      onClick={(event) => {
        event.stopPropagation();
        void deleteDocument(documentId);
      }}
    >
      <Trash2 size={14} />
    </button>
  );
}
