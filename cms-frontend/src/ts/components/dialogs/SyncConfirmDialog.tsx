import { Typography } from '@mui/material';
import { ConfirmDialog } from '@ts/components/dialogs/ConfirmDialog';

export const SyncConfirmDialog = ({
  mode,
  onClose,
  documentLabel,
  changedFields,
  documentId,
  pullDocumentData,
  pushDocumentData,
  onSynced,
}: {
  mode: 'push' | 'pull' | null;
  onClose: () => void;
  documentLabel: string;
  changedFields?: string[];
  documentId?: string;
  pullDocumentData: (documentId: string) => Promise<unknown>;
  pushDocumentData: (documentId: string) => Promise<unknown>;
  onSynced: (pulling: boolean) => void;
}) => {
  const handleConfirm = () => {
    if (!documentId) return;
    const pulling = mode === 'pull';
    const action = pulling ? pullDocumentData(documentId) : pushDocumentData(documentId);
    action.then(() => onSynced(pulling)).catch(() => undefined);
    onClose();
  };

  return (
    <ConfirmDialog
      open={!!mode}
      onClose={onClose}
      title={mode === 'push' ? 'Push document to production?' : 'Pull document from production?'}
      confirmLabel={mode === 'push' ? 'Push' : 'Pull'}
      confirmVariant="default"
      onConfirm={handleConfirm}
    >
      <Typography variant="body2" color="text.secondary">
        {mode === 'push' ? (
          changedFields
            ? <>Production&rsquo;s copy of <strong>{documentLabel}</strong> will be replaced (changed fields: {changedFields.join(', ')}).</>
            : <><strong>{documentLabel}</strong> will be added to production.</>
        ) : (
          <>Your workspace&rsquo;s copy of <strong>{documentLabel}</strong> will be overwritten with production&rsquo;s version{changedFields ? <> (changed fields: {changedFields.join(', ')})</> : null}.</>
        )}
      </Typography>
    </ConfirmDialog>
  );
};
