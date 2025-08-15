import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import parse from 'html-react-parser';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionActions,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Typography,
  Grid,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Delete as DeleteIcon, DragIndicator as DragIndicatorIcon } from '@mui/icons-material';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';

type SchemaEntryData = {[key: string]: string}

export const SchemaEntry = ({
  id,
  schemaStructure,
  schemaEntryState: [schemaEntryData, setSchemaEntryData],
  openedPanelList: [openedPanel, setOpenedPanel],
  deleteEntry
}: {
  id: number | string,
  schemaStructure: {[key: string]: string},
  schemaEntryState: [SchemaEntryData, Dispatch<SetStateAction<SchemaEntryData>>],
  openedPanelList: [string[], Dispatch<SetStateAction<string[]>>],
  deleteEntry: () => void
}) => {
  const [name, setName] = useState(schemaEntryData['_name'] ? schemaEntryData['_name'] : '<em>New Entry - Schema</em>');
  const inputRefs = useRef<HTMLDivElement[]>([]);
  const [deleteConfirmationModalClose, setDeleteConfirmationModalClose] = useState(false);

  useEffect(() => {
    if (schemaEntryData['_name']) setName(schemaEntryData['_name'])
  }, [schemaEntryData]);

  let touched: {[key: string]: boolean} = {};
  const setTouched = (key_val: {[key: string]: boolean}) => {
    touched = {...touched, ...key_val}
  }

  const handleChange = (e: any) => {
    const { name, type, value, checked } = e.target;

    if (name === '_name') setName(value == '' ? '<em>No Name</em>': value);
    setSchemaEntryData({ ...schemaEntryData, [name]: type === 'checkbox' ? checked : value });
  };

  const updateOpenedPanelList = () => {
    setOpenedPanel((prevPanels) =>
      prevPanels.includes(`panel${id}`)
        ? prevPanels.filter(panel => panel !== `panel${id}`)
        : [...prevPanels, `panel${id}`]);
  }

  return (
    <Accordion expanded={openedPanel.includes(`panel${id}`)}>
      <AccordionSummary
          expandIcon={<ExpandMoreIcon/>}
          aria-controls={`schema-panel${id}-content`}
          id={`schema-panel${id}-header`}
          onClick={updateOpenedPanelList}>
        <DragIndicatorIcon sx={{mr: 0.5}}/>
        <Typography component='span'>{parse(name)}</Typography>
      </AccordionSummary>
      <Divider/>
      <AccordionDetails>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid container size={8} spacing={2}>
            {schemaStructure && schemaEntryData ? Object.entries(schemaStructure).filter(([_, value]: [string, any]) => {
              if (value.hide_field_for) {
                return !Object.entries(value.hide_field_for).find(([_key, _value]: [string, any]) => {
                  if (_value === 'all') return true
                  return _value.includes(schemaEntryData[_key]);
                });
              }
              return true;
            }).map(([key, value]: [string, any], index: number) => {
              setTouched({key: false});

              const labelName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
              const labelValue = schemaEntryData[key] || '';
              const validationError = () => touched[key] && inputRefs.current[index].querySelector<HTMLInputElement>(':invalid') instanceof HTMLElement;

              return (
                <Grid size={6} key={key} ref={gridEl => inputRefs.current[index] = gridEl!}>
                  {value.type == 'input' ? (
                    <TextField
                        id={`panel${id}${key}`}
                        name={key}
                        label={labelName}
                        value={labelValue}
                        variant='outlined'
                        onChange={handleChange}
                        onBlur={() => setTouched({key: true})}
                        error={validationError()}
                        sx={{width: '100%'}}
                        required={value.required}/>
                  ) : value.type == 'select' ? (
                    <FormControl sx={{minWidth: 120, width: '100%'}}>
                      <InputLabel id={`panel${id}${key}-label`}>{labelName}</InputLabel>
                      <Select
                          labelId={`panel${id}${key}-label`}
                          id={`panel${id}${key}`}
                          name={key}
                          value={labelValue}
                          onChange={handleChange}
                          label={labelName}>
                        {value.choices.map((choice: string) => (
                          <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : value.type == 'multi-select' ? (
                    <FormControl sx={{minWidth: 120, width: '100%'}}>
                      <InputLabel id={key + '-label'}>{labelName}</InputLabel>
                      <Select
                          labelId={key + '-label'}
                          id={key + '-checkbox'}
                          name={key}
                          multiple
                          value={Array.isArray(labelValue) ? labelValue : []}
                          onChange={handleChange}
                          input={<OutlinedInput label={labelName}/>}
                          renderValue={(selected) => selected.join(', ')}>
                        {value.choices.map((choice: string) => (
                          <MenuItem key={choice} value={choice}>
                            <Checkbox checked={labelValue.includes(choice)} />
                            <ListItemText primary={choice} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : value.type == 'textbox' ? (
                    <TextField
                        label={labelName}
                        id={`panel${id}${key}`}
                        name={key}
                        value={labelValue}
                        onChange={handleChange}
                        multiline
                        rows={2}
                        sx={{width: '100%'}}/>
                  ) : <></>}
                </Grid>
              )
            }) : <></>}
          </Grid>
          <Divider orientation='vertical' variant='middle' flexItem sx={{my: 0}}/>
          <Grid>
            {schemaStructure && schemaEntryData ? Object.entries(schemaStructure).map(([key, value]: [string, any]) => {
              const labelName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
              const labelValue = schemaEntryData[key]

              return (
                <Grid size={12} key={key}>
                  {value.type == 'radio' ? (
                    <FormControlLabel
                        id={key}
                        name={key}
                        control={<Checkbox checked={Boolean(labelValue)}/>}
                        onChange={handleChange}
                        label={labelName}/>
                  ): <></>}
                </Grid>
              )
            }) : <></>}
          </Grid>
        </Grid>
      </AccordionDetails>
      <Divider/>
      <AccordionActions>
        <ModalContentBtn
            id='new-schema'
            modalTitle='Are you sure you want to delete the entry?'
            modalBtn={(handleClick) => (
              <Button variant='contained' color='error' onClick={handleClick} startIcon={<DeleteIcon/>}>
                Delete
              </Button>
            )}
            closeModal={deleteConfirmationModalClose}
            noCloseBtn={true}>
          <Grid container spacing={2} sx={{justifyContent: 'flex-end'}}>
            <Grid>
              <Button
                  variant='contained'
                  color='inherit'
                  onClick={() => {
                    setDeleteConfirmationModalClose(true);
                    setTimeout(setDeleteConfirmationModalClose.bind(null, false), 0);
                  }}>
                Cancel
              </Button>
            </Grid>
            <Grid>
              <Button
                  variant='contained'
                  color='error'
                  onClick={() => {
                    deleteEntry();
                    setDeleteConfirmationModalClose(true);
                    setTimeout(setDeleteConfirmationModalClose.bind(null, false), 0);
                  }}
                  startIcon={<DeleteIcon/>}>
                Delete
              </Button>
            </Grid>
          </Grid>
        </ModalContentBtn>
      </AccordionActions>
    </Accordion>
  )
}