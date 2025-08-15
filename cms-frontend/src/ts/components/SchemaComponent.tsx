import {FormEvent, useEffect, useState} from 'react';
import {
  Box,
  Divider,
  Fab,
  Skeleton,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import { SchemaEntry } from "@ts/components/SchemaEntry";
import { PageForm } from '@ts/components/PageForm';
import { useNavigate } from 'react-router-dom';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { useSchemaData } from '@/hooks/useSchema';

export const SchemaComponent = ({
  componentName,
  newSchema = false,
  MenuIcon
}: {
  componentName: string,
  newSchema?: boolean,
  MenuIcon: () => JSX.Element
}) => {
  const navigate = useNavigate();
  const {schemaVariables} = useSchemaMetaData();
  const [schemaStructure, setSchemaStructure] = useState<any>({});
  const [schema, setSchema] = useState<{[key: string]: any}[]>([]);
  const [emptySchemaEntry, setEmptySchemaEntry] = useState<{[key: string]: any}>({});
  const [newSchemaEntry, setNewSchemaEntry] = useState<{[key: string]: any}[]>([]);
  const [updatedSchemaDetails, setUpdatedSchemaDetails] = useState<{[key: string]: any}>({});
  const [openedPanel, setOpenedPanel] = useState<string[]>([]);
  const {schemaNameData, updateSchemaData, addSchemaData, deleteSchemaData} = useSchemaData(componentName);

  useEffect(() => {
    if (!newSchema) {
      setSchema(schemaNameData);
      setNewSchemaEntry([]);
    }
  }, [schemaNameData]);

  useEffect(() => {
    setOpenedPanel([]);
  }, [componentName]);

  useEffect(() => {
    if (schemaVariables) {
      const emptySchema = Object.entries(schemaVariables).reduce((acc: any, [_key, value]: [string, any]) => {
        if (_key == '_id') return acc;
        acc[_key] = value.default || "";

        if (value.type === 'radio') acc[_key] = value.required;
        if (_key == '_schema_name') acc[_key] = componentName;
        return acc;
      }, {});

      setSchemaStructure(schemaVariables);
      setEmptySchemaEntry(emptySchema);
      setNewSchemaEntry(newSchema ? [{...emptySchema, '_index': 1}] : []);
    }
  }, [schemaVariables]);

  const addNewEntry = (event: any) => {
    event.preventDefault();
    setNewSchemaEntry((prev) => [...prev, Object.entries(emptySchemaEntry).reduce((acc: any, [_key, value]: [string, any]) => {
      if (_key === '_index') {
        const index = schema.length + newSchemaEntry.length + 1;
        acc[_key] = index;
      } else acc[_key] = value
      return acc;
    }, {})]);
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    console.log("Form Data Submitted:", schema, newSchemaEntry, updatedSchemaDetails);

    if (Object.keys(updatedSchemaDetails).length !== 0) updateSchemaData(updatedSchemaDetails);
    setUpdatedSchemaDetails({});
    addSchemaData(newSchemaEntry);
  };

  return (
    <>
      {(schema && schema.length > 0) || newSchema ? (
        <PageForm
            formType='schema'
            onSubmit={handleSubmit}
            formTitle={componentName}
            submitBtnText='Save Schema'
            MenuIcon={MenuIcon}
            setOpenedPanel={setOpenedPanel}>
          <Box>
            {schema && schema.map((entry: any, index: number) => (
              <SchemaEntry
                  key={index}
                  id={entry['_id']}
                  schemaStructure={schemaStructure}
                  openedPanelList={[openedPanel, setOpenedPanel]}
                  schemaEntryState={[entry, (updatedValue) =>
                    setSchema((prevSchema) => {
                      const schemaId = entry['_id'];
                      const updatedFields = Object.keys(prevSchema[index])
                        .reduce((acc: {[key: string]: string}, key: string) => {
                          const updated_val = (updatedValue as {[key: string]: string})[key];

                          if (prevSchema[index][key] !== updated_val) acc[key] = updated_val;
                          return acc;
                        }, {});

                      setUpdatedSchemaDetails((prevUpdate) => {
                        if (!(schemaId in prevUpdate)) prevUpdate[schemaId] = {};

                        return Object.entries(prevUpdate).reduce((acc: {[key: string]: any}, [_key, value]) => {
                          acc[_key] = _key === schemaId ? {...value, ...updatedFields} : value;
                          return acc;
                        }, {});
                      });
                      return prevSchema.map((e, i) => (i === index ? updatedValue : e));
                    })
                  ]}
                  deleteEntry={() => {
                    deleteSchemaData(entry['_id']);
                    setOpenedPanel((openPanels) => openPanels.filter(panel => panel !== `panel${entry['_id']}`));

                    if (schema.length <= 1) {
                      navigate('/schema/');
                    }
                  }}
              />
            ))}
            {newSchemaEntry && newSchemaEntry.map((newEntry: any, index: number) => (
              <SchemaEntry
                  key={`new-${index}`}
                  id={`new-${index}`}
                  schemaStructure={schemaStructure}
                  openedPanelList={[openedPanel, setOpenedPanel]}
                  schemaEntryState={[newEntry, (updatedValue) =>
                    setNewSchemaEntry((prevNewEntry) => prevNewEntry.map((e, i) => (i === index ? updatedValue : e)))
                  ]}
                  deleteEntry={() => {
                    setOpenedPanel((openPanels) => openPanels.filter(panel => panel !== `panel${`new-${index}`}`));
                    setNewSchemaEntry((prevNewEntry) => prevNewEntry.filter((_, _index) => _index !== index));
                  }}
              />
            ))}
          </Box>
          <Divider className='add-new-btn'>
            <Fab color="primary" size="medium" aria-label="add" title='Add new variable' onClick={addNewEntry}>
              <AddIcon/>
            </Fab>
          </Divider>
        </PageForm>
      ) : (
        <Box className='schema-component-skeleton'>
          <Skeleton variant="text" className='schema-component-skeleton-text'/>
          <Skeleton variant="rounded" className='schema-component-skeleton-box'/>
        </Box>
      )}
    </>
  )
}