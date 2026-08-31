import { Typography } from '@mui/material';
import { ConfirmDialog } from '@ts/components/dialogs/ConfirmDialog';

export const DeleteSchemaDialog = ({
  open,
  onClose,
  schemaName,
  fieldIds,
  deleteSchemaData,
  removeSchemaName,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  schemaName: string;
  fieldIds: string[];
  deleteSchemaData: (fieldId: string) => Promise<boolean>;
  removeSchemaName: (schemaName: string) => void;
  onDeleted: () => void;
}) => {
  const handleConfirm = () => {
    Promise.all(fieldIds.map(id => deleteSchemaData(id))).then(results => {
      if (results.every(Boolean)) {
        removeSchemaName(schemaName);
        onDeleted();
      }
    });
    onClose();
  };

  return (
    <ConfirmDialog open={open} onClose={onClose} title="Delete schema?" confirmLabel="Delete Schema" onConfirm={handleConfirm}>
      <Typography variant="body2" color="text.secondary">
        This will permanently delete the <strong>{schemaName}</strong> schema and all its fields. This action cannot be undone.
      </Typography>
    </ConfirmDialog>
  );
};
