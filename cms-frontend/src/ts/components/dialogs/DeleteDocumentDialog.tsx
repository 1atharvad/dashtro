import { Typography } from '@mui/material';
import { ConfirmDialog } from '@ts/components/dialogs/ConfirmDialog';

export const DeleteDocumentDialog = ({
  open,
  onClose,
  documentLabel,
  documentId,
  deleteDocumentData,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  documentLabel: string;
  documentId?: string;
  deleteDocumentData: (documentId: string) => Promise<boolean>;
  onDeleted: () => void;
}) => {
  const handleConfirm = () => {
    if (!documentId) return;
    deleteDocumentData(documentId).then(success => { if (success) onDeleted(); });
    onClose();
  };

  return (
    <ConfirmDialog open={open} onClose={onClose} title="Delete document?" confirmLabel="Delete" onConfirm={handleConfirm}>
      <Typography variant="body2" color="text.secondary">
        This will permanently delete <strong>{documentLabel}</strong>. This action cannot be undone.
      </Typography>
    </ConfirmDialog>
  );
};
