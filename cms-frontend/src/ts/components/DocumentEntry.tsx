import { FormControlLabel, Grid, Skeleton, Switch, TextField } from '@mui/material';
import { Dispatch, SetStateAction, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ColorPickerField } from '@ts/components/fields/ColorPickerField';

const RichTextModal = lazy(() => import('@ts/components/fields/RichTextModal').then(m => ({ default: m.RichTextModal })));
import { FileField } from '@ts/components/fields/FileField';
import { ImageField } from '@ts/components/fields/ImageField';
import { LinkField } from '@ts/components/fields/LinkField';
import { CompoundField } from '@ts/components/fields/CompoundField';
import { CompoundArrayField } from '@ts/components/fields/CompoundArrayField';
import { NestedDocumentArrayField } from '@ts/components/fields/NestedDocumentArrayField';
import { ReferenceDocumentField } from '@ts/components/fields/ReferenceDocumentField';
import { SimpleArrayField } from '@ts/components/fields/SimpleArrayField';
import { getCompoundDef, getCompoundDefault, getRegistry, isCompoundField, onRegistryReady } from '@ts/config/fieldRegistry';
import type { SchemaFieldItem, DocumentData } from '@ts/types/constants';

export const DocumentEntry = ({
  id,
  variableSchema,
  variableEntryState: [variableEntry, setVariableEntry],
  schemaDetails,
  readOnly = false,
  excludeValues = [],
  onImmediateSave,
}: {
  id: string,
  variableSchema: SchemaFieldItem
  variableEntryState: [DocumentData, Dispatch<SetStateAction<DocumentData>>]
  schemaDetails: Record<string, SchemaFieldItem[]>
  readOnly?: boolean
  excludeValues?: string[]
  onImmediateSave?: (fieldName: string, value: unknown) => void
}) => {
  const [, forceUpdate] = useState(0);
  useEffect(() => onRegistryReady(() => forceUpdate(n => n + 1)), []);

  const variableType = variableSchema['_type'];
  const fieldName = variableSchema['_name'] as string;
  const labelName = fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const labelValue = variableEntry[fieldName] ?? '';
  const description = variableSchema['_description'] as string | undefined;
  const placeholder = variableSchema['_placeholder'] as string | undefined;
  const required = variableSchema['_required'] as boolean | undefined;
  const nestedSchemaName = variableSchema['_nested_schema'];
  const nestedRelation = variableSchema['_relation'] ?? 'OneToOne';
  const richTextWrapper = variableSchema['_rich_text_wrapper'] as string | undefined;
  const referenceCollections: string[] = variableSchema['_reference_schema']?.filter(Boolean) ?? [];
  const nestedSchema = nestedSchemaName && variableType === 'NestedDocument'
    ? schemaDetails[nestedSchemaName]
    : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = e.target;
    setVariableEntry(prev => ({ ...prev, [fieldName]: value }));
  };

  const onImmediateSaveRef = useRef(onImmediateSave);
  onImmediateSaveRef.current = onImmediateSave;

  const setVariableEntryRef = useRef(setVariableEntry);
  setVariableEntryRef.current = setVariableEntry;

  const textFieldProps = {
    fullWidth: true,
    label: labelName,
    value: labelValue,
    onChange: handleChange,
    required,
    disabled: readOnly,
    helperText: description,
    placeholder,
    slotProps: { inputLabel: { shrink: true } },
    className: 'variable-input',
  };

  // Defaults for all types — compound type defaults come from the registry
  const defaultItemForType: Record<string, unknown> = {
    String: '', Number: '', Email: '', Date: '', DateTime: '',
    RichText: '', Textarea: '', File: '', ReferenceDocument: '',
    Boolean: 'false',
    Color: '#000000',
    ...Object.fromEntries(
      Object.entries(getRegistry()?.compound_types ?? {}).map(([type, def]) => [type, def.default])
    ),
  };

  // Compound types (URL, Image, ScrollLink…) with OneToMany get accordion renderer
  if (isCompoundField(variableType) && nestedRelation === 'OneToMany') {
    return (
      <CompoundArrayField
        label={labelName}
        fieldName={fieldName}
        fieldType={variableType}
        value={Array.isArray(labelValue) ? labelValue : []}
        onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
        readOnly={readOnly}
      />
    );
  }

  // Any non-NestedDocument, non-RichText, non-compound type marked OneToMany renders as a simple array
  if (variableType !== 'NestedDocument' && variableType !== 'RichText' && !isCompoundField(variableType) && nestedRelation === 'OneToMany') {
    return (
      <SimpleArrayField
        label={labelName}
        fieldName={fieldName}
        variableSchema={variableSchema}
        schemaDetails={schemaDetails}
        value={Array.isArray(labelValue) ? labelValue : []}
        onChange={val =>
          setVariableEntry(prev => ({
            ...prev,
            [fieldName]: val,
          }))
        }
        readOnly={readOnly}
        defaultItem={defaultItemForType[variableType] ?? ''}
      />
    );
  }

  return (
    <>
      {variableSchema && <>

        {variableType === 'String' && (
          <TextField {...textFieldProps} name={fieldName} id={id} />
        )}

        {variableType === 'Number' && (
          <TextField
            {...textFieldProps}
            type="number"
            name={fieldName}
            id={id}
            onChange={e => {
              const v = e.target.value;
              setVariableEntry(prev => ({ ...prev, [fieldName]: v === '' ? '' : Number(v) }));
            }}
          />
        )}

        {variableType === 'Email' && (
          <TextField {...textFieldProps} type="email" name={fieldName} id={id} placeholder="Email Address" />
        )}

        {variableType === 'URL' && (
          <LinkField
            label={labelName}
            value={labelValue}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            disabled={readOnly}
          />
        )}

        {variableType === 'Date' && (
          <TextField {...textFieldProps} type="date" name={fieldName} id={id} />
        )}

        {variableType === 'DateTime' && (
          <TextField {...textFieldProps} type="datetime-local" name={fieldName} id={id} />
        )}

        {variableType === 'RichText' && (
          <Suspense fallback={<Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />}>
            <RichTextModal
              label={labelName}
              value={labelValue}
              onChange={(val: string) => {
                setVariableEntryRef.current(prev => ({ ...prev, [fieldName]: val }));
                onImmediateSaveRef.current?.(fieldName, val);
              }}
              disabled={readOnly}
              wrapperKey={richTextWrapper}
            />
          </Suspense>
        )}

        {variableType === 'Textarea' && (
          <TextField
            {...textFieldProps}
            name={fieldName}
            id={id}
            multiline
            minRows={4}
            maxRows={12}
          />
        )}

        {variableType === 'Image' && (
          <ImageField
            label={labelName}
            value={labelValue}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            disabled={readOnly}
          />
        )}

        {variableType === 'File' && (
          <FileField
            label={labelName}
            value={labelValue}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            disabled={readOnly}
          />
        )}

        {variableType === 'Color' && (
          <ColorPickerField
            name={fieldName}
            label={labelName}
            value={String(labelValue || '#000000')}
            onChange={(_name, val) => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
          />
        )}

        {variableType === 'Boolean' && (
          <FormControlLabel
            label={labelName}
            disabled={readOnly}
            sx={{ pl: 1.5 }}
            control={
              <Switch
                checked={labelValue === true || labelValue === 'true'}
                onChange={e => setVariableEntry(prev => ({ ...prev, [fieldName]: e.target.checked }))}
                size="small"
              />
            }
          />
        )}

        {variableType === 'ReferenceDocument' && (
          <ReferenceDocumentField
            label={labelName}
            value={typeof labelValue === 'object' && labelValue !== null
              ? ((labelValue as { _document_id?: string })._document_id ?? '')
              : String(labelValue ?? '')}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            referenceCollections={referenceCollections}
            disabled={readOnly}
            placeholder={placeholder}
            excludeValues={excludeValues}
          />
        )}

        {isCompoundField(variableType) && !getCompoundDef(variableType)?.dedicated_component && nestedRelation !== 'OneToMany' && (
          <CompoundField
            fieldType={variableType}
            label={labelName}
            value={labelValue ?? getCompoundDefault(variableType)}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            disabled={readOnly}
          />
        )}

        {variableType === 'NestedDocument' && nestedRelation === 'OneToMany' && (
          <NestedDocumentArrayField
            label={labelName}
            fieldName={fieldName}
            schema={nestedSchema ?? []}
            schemaDetails={schemaDetails}
            value={Array.isArray(labelValue) ? labelValue : []}
            onChange={val => setVariableEntry(prev => ({ ...prev, [fieldName]: val }))}
            onImmediateSave={onImmediateSave ? val => onImmediateSave(fieldName, val) : undefined}
            readOnly={readOnly}
          />
        )}

        {variableType === 'NestedDocument' && nestedRelation !== 'OneToMany' && (
          <>
            <label className='nested-variable-label'>{labelName}</label>
            <Grid container spacing={2} id={id} className="nested-document-variable-container">
              {nestedSchema && nestedSchema.map((entry, index: number) => (
                <Grid key={index} className='nested-document-variable'>
                  <DocumentEntry
                    id={`${id}-${entry['_index']}`}
                    variableSchema={entry}
                    variableEntryState={[(variableEntry[fieldName] ?? {}) as DocumentData, (updatedValueOrFn) => {
                      setVariableEntry(prev => {
                        const currentNested = (prev[fieldName] ?? {}) as DocumentData;
                        const newValue = typeof updatedValueOrFn === 'function'
                          ? updatedValueOrFn(currentNested)
                          : updatedValueOrFn;
                        return { ...prev, [fieldName]: newValue };
                      });
                      return updatedValueOrFn;
                    }]}
                    schemaDetails={schemaDetails}
                    readOnly={readOnly}
                    onImmediateSave={onImmediateSave ? (nestedFieldName, val) => {
                      const currentNested = (variableEntry[fieldName] ?? {}) as DocumentData;
                      onImmediateSave(fieldName, { ...currentNested, [nestedFieldName]: val });
                    } : undefined}
                  />
                </Grid>
              ))}
            </Grid>
          </>
        )}

      </>}
    </>
  );
}
