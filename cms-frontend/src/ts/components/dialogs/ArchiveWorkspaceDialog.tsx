import { Typography } from '@mui/material';
import { toast } from 'advi-ui';
import { ConfirmDialog } from '@ts/components/dialogs/ConfirmDialog';

export const ArchiveWorkspaceDialog = ({
  workspaceName,
  onClose,
  removeWorkspace,
}: {
  workspaceName: string | null;
  onClose: () => void;
  removeWorkspace: (name: string) => Promise<unknown>;
}) => {
  const handleConfirm = () => {
    if (workspaceName) {
      removeWorkspace(workspaceName).catch(err => {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Failed to delete workspace');
      });
    }
    onClose();
  };

  return (
    <ConfirmDialog open={!!workspaceName} onClose={onClose} title="Archive workspace?" confirmLabel="Archive" onConfirm={handleConfirm}>
      <Typography variant="body2" color="text.secondary">
        All content in &ldquo;{workspaceName}&rdquo; will be permanently deleted.
      </Typography>
    </ConfirmDialog>
  );
};
