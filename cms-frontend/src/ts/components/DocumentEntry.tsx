import {
  Divider,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Grid,
  useTheme,
} from '@mui/material';
import { Dispatch, SetStateAction } from 'react';

type SchemaVariableData = {[key: string]: any}

export const DocumentEntry = ({
  id,
  variableSchema,
  variableEntryState: [variableEntry, setVariableEntry],
  schemaDetails
}: {
  id: string,
  variableSchema: {[key: string]: any}
  variableEntryState: [SchemaVariableData, Dispatch<SetStateAction<SchemaVariableData>>]
  schemaDetails: {[key: string]: any}
}) => {
  const theme = useTheme();
  const variableType = variableSchema['_type'];
  const labelName = variableSchema['_name'];
  const labelValue = variableEntry[labelName] || '';
  const nestedSchemaName = variableSchema['_nested_schema']
  const nestedSchema = nestedSchemaName && variableType == 'NestedDocument' ? schemaDetails[variableSchema['_nested_schema']] : [];

  const handleChange = (event: any) => {
    const { name, value } = event.target;

    setVariableEntry({ ...variableEntry, [name]: value });
  };

  return (
    <>
      {variableSchema && <>
        {variableType === 'String' ? ( // For variable type "String"
          <FormControl variant="standard" className='variable-input-wrapper'>
            <InputLabel className='variable-label' htmlFor={id}>
              {labelName.replaceAll('_', ' ')}
            </InputLabel>
            <TextField
                id={id}
                name={variableSchema['_name']}
                aria-describedby={`${id}-helper-text`}
                className='variable-input'
                value={labelValue}
                variant='outlined'
                onChange={handleChange}
                required={variableSchema['_required']}/>
            {variableSchema['_description'] && <FormHelperText
                id={`${id}-helper-text`}
                className='variable-helper-text'
                sx={{color: theme.palette.helperTextColor}}>
              {variableSchema['_description']}
            </FormHelperText>}
          </FormControl>
        ) : variableType === 'Boolean' ? ( // For variable type "Boolean"
          <FormControl className='variable-input-wrapper'>
            <InputLabel className='variable-label' htmlFor={id}>
              {labelName.replaceAll('_', ' ')}
            </InputLabel>
            <Select
                id={id}
                name={variableSchema['_name']}
                aria-describedby={`${id}-helper-text`}
                value={labelValue}
                className='variable-input'
                variant='outlined'
                onChange={handleChange}>
              {[true, false].map((choice) => (
                <MenuItem key={`choice-${choice}`} value={String(choice)} selected={choice === labelValue}>
                  {choice ? 'True' : 'False'}
                </MenuItem>
              ))}
            </Select>
            {variableSchema['_description'] && <FormHelperText
                id={`${id}-helper-text`}
                className='variable-helper-text'
                sx={{color: theme.palette.helperTextColor}}>
              {variableSchema['_description']}
            </FormHelperText>}
          </FormControl>
        ) : variableType === 'NestedDocument' ? ( // For variable type "NestedDocument"
          <>
            <InputLabel className='nested-variable-label' htmlFor={id}>
              {labelName.replaceAll('_', ' ')}
            </InputLabel>
            <Grid container spacing={2} id={id} className="nested-document-variable-container">
              {nestedSchema && nestedSchema.map((entry: any, index: number) => (
                <Grid key={index}
                    className='nested-document-variable'
                    sx={{'--border-color': theme.palette.borderColor}}>
                  <DocumentEntry
                      id={`${id}-${entry['_index']}`}
                      variableSchema={entry}
                      variableEntryState={[variableEntry[labelName], (updatedValue) => {
                        setVariableEntry(prevValue => {
                          return { ...prevValue, [labelName]: updatedValue }
                        });
                        return updatedValue;
                      }]}
                      schemaDetails={schemaDetails}/>
                  {index < nestedSchema.length - 1 && entry['_type'] !== 'NestedDocument' && <Divider/>}
                </Grid>
              ))}
            </Grid>
          </>
        ) : (
          <></>
        )}
      </>}
    </>
  )
}