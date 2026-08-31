import { Typography } from '@mui/material';
import { ConfirmDialog } from '@ts/components/dialogs/ConfirmDialog';

export const DeleteProjectDialog = ({
  open,
  onClose,
  projectName,
  removeProject,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  removeProject: () => Promise<boolean>;
  onDeleted: () => void;
}) => {
  const handleDelete = () => {
    removeProject().then(success => {
      if (success) onDeleted();
    });
    onClose();
  };

  return (
    <ConfirmDialog open={open} onClose={onClose} title="Delete project?" confirmLabel="Delete Project" onConfirm={handleDelete}>
      <Typography variant="body2" color="text.secondary">
        &ldquo;{projectName}&rdquo; and all of its workspaces, schema, collections, and documents will be permanently deleted. This cannot be undone.
      </Typography>
    </ConfirmDialog>
  );
};
