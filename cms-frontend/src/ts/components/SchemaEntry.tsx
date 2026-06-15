import { Dispatch, ReactNode, SetStateAction, useEffect, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Divider, FormControlLabel,
  Grid, MenuItem, Switch, TextField, Typography,
} from '@mui/material';
import { Trash2, ChevronDown } from 'lucide-react';
import { Button } from 'advi-ui';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';
import { ColorPickerField } from '@ts/components/fields/ColorPickerField';

type SchemaEntryData = {[key: string]: string}

export const SchemaEntry = ({
  id,
  schemaStructure,
  schemaEntryState: [schemaEntryData, setSchemaEntryData],
  openedPanelList: [openedPanel, setOpenedPanel],
  deleteEntry,
  dragHandle,
  disabled = false,
}: {
  id: number | string,
  schemaStructure: {[key: string]: string | boolean},
  schemaEntryState: [SchemaEntryData, Dispatch<SetStateAction<SchemaEntryData>>],
  openedPanelList: [string[], Dispatch<SetStateAction<string[]>>],
  deleteEntry: () => void,
  dragHandle?: ReactNode,
  disabled?: boolean,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, type, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    if (name === '_name') setName(value === '' ? '<em>No Name</em>' : value);
    setSchemaEntryData({ ...schemaEntryData, [name]: type === 'checkbox' ? String(checked) : value });
  };

  const handleSelectChange = (fieldName: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...schemaEntryData, [fieldName]: e.target.value };
    if (fieldName === '_type' && e.target.value === 'Boolean' && !['true', 'false'].includes(updated['_default_value'])) {
      updated['_default_value'] = 'false';
    }
    setSchemaEntryData(updated);
  };

  const handleMultiSelectChange = (fieldName: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSchemaEntryData({ ...schemaEntryData, [fieldName]: (typeof val === 'string' ? val.split(',') : val) as unknown as string });
  };

  const panelKey = `panel${id}`;
  const isOpen = openedPanel.includes(panelKey);

  const accordionContent = (
    <>
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid container size={8} spacing={2}>
          {schemaStructure && schemaEntryData ? Object.entries(schemaStructure).filter(([_, value]: [string, any]) => {
            if (value.hide_field_for) {
              return !Object.entries(value.hide_field_for).find(([_key, _value]: [string, any]) => {
                if (_value === 'all') return true;
                return _value.includes(schemaEntryData[_key]);
              });
            }
            return true;
          }).map(([key, value]: [string, any], index: number) => {
            setTouched({key: false});
            const labelOverrides: Record<string, string> = { _reference_schema: 'Reference Collection' };
            const labelName = labelOverrides[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
            const labelValue = schemaEntryData[key] || '';
            const validationError = () => touched[key] && inputRefs.current[index]?.querySelector<HTMLInputElement>(':invalid') instanceof HTMLElement;

            return (
              <Grid size={6} key={key} ref={gridEl => inputRefs.current[index] = gridEl!}>
                {value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'Boolean' ? (
                  <TextField
                      fullWidth
                      select
                      disabled={disabled}
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleSelectChange(key)}>
                    <MenuItem value="true">true</MenuItem>
                    <MenuItem value="false">false</MenuItem>
                  </TextField>
                ) : value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'Color' ? (
                  <ColorPickerField
                    name={key}
                    label={labelName}
                    value={labelValue || '#000000'}
                    onChange={(fieldName, val) => setSchemaEntryData({ ...schemaEntryData, [fieldName]: val })}
                  />
                ) : value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'Date' ? (
                  <TextField
                      fullWidth
                      type="date"
                      name={key}
                      label={labelName}
                      value={labelValue}
                      disabled={disabled}
                      onChange={handleChange}
                      slotProps={{ inputLabel: { shrink: true } }}/>
                ) : value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'DateTime' ? (
                  <TextField
                      fullWidth
                      type="datetime-local"
                      name={key}
                      label={labelName}
                      value={labelValue}
                      disabled={disabled}
                      onChange={handleChange}
                      slotProps={{ inputLabel: { shrink: true } }}/>
                ) : value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'Email' ? (
                  <TextField
                      fullWidth
                      type="email"
                      disabled={disabled}
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleChange}/>
                ) : value.type === 'input' && key === '_default_value' && schemaEntryData['_type'] === 'URL' ? (
                  null
                ) : value.type === 'input' ? (
                  <TextField
                      fullWidth
                      disabled={disabled}
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleChange}
                      onBlur={() => setTouched({key: true})}
                      error={validationError()}
                      required={value.required}/>
                ) : value.type === 'select' ? (
                  <TextField
                      fullWidth
                      select
                      disabled={disabled}
                      name={key}
                      label={labelName}
                      value={value.choices.includes(labelValue) ? labelValue : (labelValue || '')}
                      onChange={handleSelectChange(key)}>
                    {labelValue && !value.choices.includes(labelValue) && (
                      <MenuItem key={labelValue} value={labelValue} disabled>
                        {labelValue} (unavailable)
                      </MenuItem>
                    )}
                    {value.choices.map((c: string) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                ) : value.type === 'multi-select' ? (
                  <TextField
                      fullWidth
                      select
                      disabled={disabled}
                      name={key}
                      label={labelName}
                      value={Array.isArray(labelValue) ? labelValue : []}
                      onChange={handleMultiSelectChange(key)}
                      slotProps={{ select: { multiple: true } }}>
                    {(Array.isArray(labelValue) ? labelValue : [])
                      .filter((v: string) => !value.choices.includes(v))
                      .map((v: string) => (
                        <MenuItem key={v} value={v} disabled>{v} (unavailable)</MenuItem>
                      ))
                    }
                    {value.choices.map((c: string) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                ) : value.type === 'textbox' ? (
                  <TextField
                      fullWidth
                      multiline
                      disabled={disabled}
                      rows={2}
                      name={key}
                      label={labelName}
                      value={labelValue}
                      onChange={handleChange}/>
                ) : <></>}
              </Grid>
            );
          }) : <></>}
        </Grid>
        <Divider orientation='vertical' variant='middle' flexItem sx={{my: 0}}/>
        <Grid>
          {schemaStructure && schemaEntryData ? Object.entries(schemaStructure).map(([key, value]: [string, any]) => {
            const labelName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
            const labelValue = schemaEntryData[key];
            return (
              <Grid size={12} key={key}>
                {value.type === 'radio' ? (
                  <FormControlLabel
                      disabled={disabled}
                      control={
                        <Switch
                            name={key}
                            checked={String(labelValue) === 'true'}
                            onChange={handleChange}/>
                      }
                      label={labelName}/>
                ) : <></>}
              </Grid>
            );
          }) : <></>}
        </Grid>
      </Grid>
      {!disabled && <Divider sx={{ mt: 2 }}/>}
      {!disabled && <Grid container spacing={2} sx={{ justifyContent: 'flex-end', mt: 1 }}>
        <ModalContentBtn
            id='delete-schema-entry'
            modalTitle='Are you sure you want to delete the entry?'
            modalBtn={(handleClick) => (
              <Button variant='destructive' onClick={handleClick}>
                <Trash2 className="h-4 w-4" /> Delete
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
                <Trash2 className="h-4 w-4 fill-white" /> Delete
              </Button>
            </Grid>
          </Grid>
        </ModalContentBtn>
      </Grid>}
    </>
  );

  return (
    <Accordion
        expanded={isOpen}
        disableGutters
        slotProps={{ transition: { unmountOnExit: false } }}
        onChange={(_, expanded) => {
          setOpenedPanel(prev =>
            expanded
              ? [...prev.filter(p => p !== panelKey), panelKey]
              : prev.filter(p => p !== panelKey)
          );
        }}>
      <AccordionSummary expandIcon={<ChevronDown className="h-4 w-4" />}>
        {dragHandle}
        <Typography dangerouslySetInnerHTML={{ __html: name }}/>
      </AccordionSummary>
      <AccordionDetails>
        {accordionContent}
      </AccordionDetails>
    </Accordion>
  );
}
