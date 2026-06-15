import { useState, ReactNode, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, Divider, IconButton } from '@mui/material';
import { X as CloseIcon } from 'lucide-react';

export const ModalContentBtn = ({
  modalBtn,
  modalTitle,
  closeModal,
  onClose,
  children
}: {
  id?: string,
  modalBtn: (handleClick: () => void) => ReactNode,
  modalTitle: string,
  closeModal?: boolean,
  onClose?: () => void,
  noCloseBtn?: boolean,
  children: ReactNode
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (closeModal) setOpen(false);
  }, [closeModal]);

  const handleClose = () => {
    setOpen(false);
    if (onClose) onClose();
  };

  return (
    <>
      {modalBtn(() => setOpen(true))}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          {modalTitle}
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon className="h-4 w-4"/>
          </IconButton>
        </DialogTitle>
        <Divider/>
        <DialogContent sx={{ pt: 2 }}>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
