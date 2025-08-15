import { useState, ReactNode, useEffect } from 'react';
import { Box, Divider, Fab, Grid, Modal, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import '@/scss/Modal.scss';

export const ModalContentBtn = ({
  id,
  modalBtn,
  modalTitle,
  closeModal,
  onClose,
  noCloseBtn = false,
  children
}: {
  id: string,
  modalBtn: (handleClick: () => void) => ReactNode,
  modalTitle: string,
  closeModal?: boolean,
  onClose?: Function,
  noCloseBtn?: Boolean
  children: ReactNode
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (closeModal) setOpen(false);
  }, [closeModal])

  const handleBtnClick = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);

    if (onClose) onClose();
  };

  return (
    <Box>
      {modalBtn(handleBtnClick)}
      <Modal
          id={`${id}-model`}
          open={open}
          onClose={handleClose}
          aria-labelledby='modal-title'
          aria-describedby='modal-content'>
        <Box className='modal'>
          <Grid container spacing={!noCloseBtn ? 2 : 0} className='modal-heading'>
            <Grid>
              <Typography component='h2' id={`${id}-model-title`} className='modal-title'>
                {modalTitle}
              </Typography>
            </Grid>
            {!noCloseBtn && <Grid>
              <Fab size='medium' color='primary' aria-label='add' onClick={handleClose}>
                <CloseIcon/>
              </Fab>
            </Grid>}
          </Grid>
          <Divider className='modal-divider'/>
          <Box id={`${id}-model-content`}>
            {children}
          </Box>
        </Box>
      </Modal>
    </Box>
  )
}