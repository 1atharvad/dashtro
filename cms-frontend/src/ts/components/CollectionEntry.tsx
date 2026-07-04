import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Divider, Grid, MenuItem, TextField, Typography } from "@mui/material";
import { Trash2 as DeleteIcon, ChevronDown as ExpandMoreIcon } from "lucide-react";
import { Button } from "advi-ui";
import { ModalContentBtn } from "@ts/components/ModalContentBtn";
import type { CollectionUiSchema, CollectionEntryData } from '@ts/types/constants';

export const CollectionEntry = ({
  collectionStructure,
  collectionEntryState: [collectionEntryData, setCollectionEntryData],
  openedPanelList: [openedPanel, setOpenedPanel],
  deleteEntry,
  id
}: {
  collectionStructure: CollectionUiSchema,
  collectionEntryState: [CollectionEntryData, (updated: CollectionEntryData) => void],
  openedPanelList: [string[], Dispatch<SetStateAction<string[]>>],
  deleteEntry: () => void,
  id: number | string
}) => {
  const snakeToCamelCase = (word: string) =>
    word.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

  const [name, setName] = useState('');
  const [deleteConfirmationModalClose, setDeleteConfirmationModalClose] = useState(false);
  const [entryIsDirty, setEntryIsDirty] = useState(false);
  const [schemaNamePresent, setSchemaNamePresent] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCollectionEntryData({...collectionEntryData, [name]: value});
    if (name === '_collection_name') setEntryIsDirty(true);
  };

  const handleSelectChange = (fieldName: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCollectionEntryData({ ...collectionEntryData, [fieldName]: e.target.value });
  };

  // Intentionally checks only the initial value — this locks the schema
  // dropdown for entries that already had a schema assigned when the
  // form opened, and should not re-lock/unlock as the user types.
  useEffect(() => {
    if (collectionEntryData['_schema_name']) setSchemaNamePresent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const collectionName = collectionEntryData['_collection_name'];
    setName(collectionName
        ? snakeToCamelCase(String(collectionName))
        : entryIsDirty
            ? '<em>No Collection Name</em>'
            : '<em>New Entry - Collection</em>');
  }, [collectionEntryData, entryIsDirty]);

  const panelKey = `panel${id}`;
  const isOpen = openedPanel.includes(panelKey);

  const accordionContent = (
    <>
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid container size={12} spacing={2}>
          {collectionStructure && collectionEntryData ? Object.entries(collectionStructure).filter(([, value]) => {
            if (value.hide_field_for) {
              return !Object.entries(value.hide_field_for).find(([_key, _value]) => {
                if (_value === 'all') return true;
                return _value.includes(String(collectionEntryData[_key]));
              });
            }
            return true;
          }).map(([key, value]) => {
            const labelName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
            const labelValue = collectionEntryData[key] || '';

            return (
              <Grid size={6} key={key}>
                {value.type === 'input' ? (
                  <TextField
                      fullWidth
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleChange}
                      required={value.required}/>
                ) : value.type === 'textbox' ? (
                  <TextField
                      fullWidth
                      multiline
                      rows={2}
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleChange}/>
                ) : value.type === 'select' ? (
                  <TextField
                      fullWidth
                      select
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleSelectChange(key)}
                      disabled={schemaNamePresent}>
                    {(value.choices ?? []).map((c: string) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                ) : <></>}
              </Grid>
            );
          }) : <></>}
        </Grid>
      </Grid>
      <Divider sx={{ mt: 2 }}/>
      <Grid container spacing={2} sx={{ justifyContent: 'flex-end', mt: 1 }}>
        <ModalContentBtn
            id='delete-collection-entry'
            modalTitle='Are you sure you want to delete the entry?'
            modalBtn={(handleClick) => (
              <Button variant='destructive' onClick={handleClick}>
                <DeleteIcon className="h-4 w-4"/> Delete
              </Button>
            )}
            closeModal={deleteConfirmationModalClose}
            noCloseBtn={true}>
          <Grid container spacing={2} sx={{justifyContent: 'flex-end'}}>
            <Grid>
              <Button
                  variant='secondary'
                  onClick={() => {
                    setDeleteConfirmationModalClose(true);
                    setTimeout(setDeleteConfirmationModalClose.bind(null, false), 0);
                  }}>
                Cancel
              </Button>
            </Grid>
            <Grid>
              <Button
                  variant='destructive'
                  onClick={() => {
                    deleteEntry();
                    setDeleteConfirmationModalClose(true);
                    setTimeout(setDeleteConfirmationModalClose.bind(null, false), 0);
                  }}>
                <DeleteIcon className="h-4 w-4"/> Delete
              </Button>
            </Grid>
          </Grid>
        </ModalContentBtn>
      </Grid>
    </>
  );

  return (
    <Accordion
        expanded={isOpen}
        onChange={(_, expanded) => {
          setOpenedPanel((prev: string[]) =>
            expanded
              ? [...prev.filter(p => p !== panelKey), panelKey]
              : prev.filter(p => p !== panelKey)
          );
        }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
        <Typography dangerouslySetInnerHTML={{ __html: name }}/>
      </AccordionSummary>
      <AccordionDetails>
        {accordionContent}
      </AccordionDetails>
    </Accordion>
  );
}
