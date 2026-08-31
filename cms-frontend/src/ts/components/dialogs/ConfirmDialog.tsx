import type { ReactNode } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Button } from 'advi-ui';

export const ConfirmDialog = ({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  confirmVariant = 'destructive',
  cancelLabel = 'Cancel',
  maxWidth = 'xs',
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'destructive' | 'default';
  cancelLabel?: string;
  maxWidth?: 'xs' | 'sm';
  onConfirm: () => void;
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>{children}</DialogContent>
    <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
      <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
      <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
    </DialogActions>
  </Dialog>
);
