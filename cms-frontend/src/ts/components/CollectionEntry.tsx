import { Dispatch, SetStateAction, useEffect, useState } from "react";
import parse from "html-react-parser";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionActions,
  Button,
  Divider,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { ModalContentBtn } from "@ts/components/ModalContentBtn";

type CollectionEntryData = {[key: string]: string}

export const CollectionEntry = ({
  collectionStructure,
  collectionEntryState: [collectionEntryData, setCollectionEntryData],
  openedPanelList: [openedPanel, setOpenedPanel],
  deleteEntry,
  id
}: {
  collectionStructure: {[key: string]: string},
  collectionEntryState: [CollectionEntryData, Dispatch<SetStateAction<CollectionEntryData>>],
  openedPanelList: [string[], Dispatch<SetStateAction<string[]>>],
  deleteEntry: () => void,
  id: number | string
}) => {
  const snakeToCamelCase = (word: string) => word.split('_').map((_word) => _word.charAt(0).toUpperCase() + _word.slice(1)).join('');

  const [name, setName] = useState('');
  const [deleteConfirmationModalClose, setDeleteConfirmationModalClose] = useState(false);
  const [entryIsDirty, setEntryIsDirty] = useState(false);
  const [schemaNamePresent, setSchemaNamePresent] = useState(false);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setCollectionEntryData({...collectionEntryData, [name]: value});

    if (name == '_collection_name') setEntryIsDirty(true);
  };

  useEffect(() => {
    if (collectionEntryData['_schema_name']) setSchemaNamePresent(true);
  }, []);

  useEffect(() => {
    const collectionName = collectionEntryData['_collection_name']
    setName(collectionName
        ? snakeToCamelCase(collectionName)
        : entryIsDirty
            ? '<em>No Collection Name</em>'
            : '<em>New Entry - Collection</em>');
  }, [collectionEntryData])

  const updateOpenedPanelList = () => {
    setOpenedPanel((prevPanels) => {
      console.log(prevPanels)
      return prevPanels.includes(`panel${id}`)
        ? prevPanels.filter(panel => panel !== `panel${id}`)
        : [...prevPanels, `panel${id}`]
      });
  }

  return (
    <Accordion expanded={openedPanel.includes(`panel${id}`)}>
      <AccordionSummary
          expandIcon={<ExpandMoreIcon/>}
          aria-controls={`collection-panel${id}-content`}
          id={`collection-panel${id}-header`}
          onClick={updateOpenedPanelList}>
        <Typography component="span">{parse(name)}</Typography>
      </AccordionSummary>
      <Divider/>
      <AccordionDetails>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid container size={12} spacing={2}>
            {collectionStructure && collectionEntryData ? Object.entries(collectionStructure).filter(([_, value]: [string, any]) => {
              if (value.hide_field_for) {
                return !Object.entries(value.hide_field_for).find(([_key, _value]: [string, any]) => {
                  if (_value === 'all') return true
                  return _value.includes(collectionEntryData[_key]);
                });
              }
              return true;
            }).map(([key, value]: [string, any]) => {
              const labelName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
              const labelValue = collectionEntryData[key] || ''

              return (
                <Grid size={6} key={key}>
                  {value.type == 'input' ? (
                    <TextField
                        id={`panel${id}${key}`}
                        name={key}
                        label={labelName}
                        value={labelValue}
                        variant="outlined"
                        onChange={handleChange}
                        sx={{width: '100%'}}
                        required={value.required}/>
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
                  ) : value.type == 'select' ? (
                    <FormControl sx={{minWidth: 120, width: '100%'}}>
                      <InputLabel id={`panel${id}${key}-label`}>{labelName}</InputLabel>
                      <Select
                          labelId={`panel${id}${key}-label`}
                          id={`panel${id}${key}`}
                          name={key}
                          value={labelValue}
                          onChange={handleChange}
                          label={labelName}
                          disabled={schemaNamePresent}>
                        {value.choices.map((choice: string) => (
                          <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : <></>}
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
          <Grid container spacing={2} sx={{justifyContent: "flex-end"}}>
            <Grid>
              <Button
                  variant="contained"
                  color="inherit"
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