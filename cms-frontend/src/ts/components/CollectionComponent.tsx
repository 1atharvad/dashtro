import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Box, Divider, Fab, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { Button } from 'advi-ui';
import { Plus as AddIcon } from 'lucide-react';
import { Loading } from 'advi-ui';
import { CollectionEntry } from '@ts/components/CollectionEntry';
import { PageForm } from '@ts/components/PageForm';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';
import { useNavigate, useParams } from 'react-router-dom';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { useCollectionData } from '@/hooks/useCollection';
import { useCategory } from '@/hooks/useCategory';
import type { NewCollectionInput, CollectionEntryData } from '@ts/types/constants';

const NewSchemaModalBtn = () => {
  const navigate = useNavigate();
  const { project_id = '' } = useParams<{ project_id: string }>();
  const [closeModal, setCloseModal] = useState<boolean>(false);
  const [labelValue, setLabelValue] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { schemaNames } = useSchemaMetaData(project_id);
  const { categories, assignSchemaCategory } = useCategory(project_id);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLabelValue(event.target.value);
    setErrorMessage('');
  };

  const handleValidation = () => {
    if (labelValue === '') return 'Schema name required.';
    if (schemaNames.includes(labelValue)) return `${labelValue} schema already exists.`;
    return '';
  };

  const addNewSchema = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const error = handleValidation();
    if (error.length === 0) {
      if (categoryId) assignSchemaCategory(labelValue, categoryId);
      setCloseModal(true);
      navigate(`/projects/${project_id}/schema/${labelValue}/`);
      setTimeout(setCloseModal.bind(null, false), 0);
    } else {
      setErrorMessage(error);
    }
  };

  return (
    <ModalContentBtn id="new-schema" modalTitle="Create New Schema" modalBtn={(handleClick) => (
      <Button variant="secondary" onClick={handleClick} className="border-current">
        Add new Schema
      </Button>
    )} closeModal={closeModal}>
      <Box component="form" className="new-schema-model" onSubmit={addNewSchema}
        sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField
          fullWidth
          id="new-schema-name"
          name="new-schema-name"
          label="Schema Name"
          value={labelValue}
          onChange={handleChange}
          error={!!errorMessage}
          helperText={errorMessage || 'PascalCase, e.g. BlogPost'}
          required
          autoFocus
        />
        <TextField
          fullWidth
          select
          label="Category (optional)"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
        >
          <MenuItem value="">General</MenuItem>
          {categories.map(cat => (
            <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button variant="default" type="submit" className="border-current">
            <AddIcon className="h-4 w-4" /> Save
          </Button>
        </Box>
      </Box>
    </ModalContentBtn>
  );
};

export const CollectionComponent = () => {
  const { project_id = '' } = useParams<{ project_id: string }>();
  const {
    collections: collectionsData,
    collectionStructure,
    loading,
    addCollectionData,
    updateCollectionData,
    deleteCollectionData
  } = useCollectionData(project_id);
  const [collections, setCollections] = useState<CollectionEntryData[]>([]);
  const [emptyCollectionEntry, setEmptyCollectionEntry] = useState<CollectionEntryData>({});
  const [updatedCollectionDetails, setUpdatedCollectionDetails] = useState<Record<string, NewCollectionInput>>({});
  const [newCollectionEntry, setNewCollectionEntry] = useState<CollectionEntryData[]>([]);
  const [openedPanel, setOpenedPanel] = useState<string[]>([]);

  useEffect(() => {
    if (!loading) {
      setCollections(collectionsData as unknown as CollectionEntryData[]);
      setNewCollectionEntry([]);
      setEmptyCollectionEntry(
        Object.entries(collectionStructure).reduce((acc: CollectionEntryData, [key, value]) => {
          acc[key] = value.default || "";
          return acc;
        }, {})
      );
    }
  }, [loading, collectionsData, collectionStructure]);

  const addNewEntry = (event: FormEvent) => {
    event.preventDefault();
    setNewCollectionEntry((prev) => [
      ...prev,
      Object.entries(emptyCollectionEntry).reduce((acc: CollectionEntryData, [key, value]) => {
        acc[key] = key === '_index' ? collections.length + newCollectionEntry.length + 1 : value;
        return acc;
      }, {})
    ]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    addCollectionData(newCollectionEntry);
    updateCollectionData(updatedCollectionDetails);
    setUpdatedCollectionDetails({});
    setOpenedPanel([]);
  };

  return (
    <>
      {!loading ? (
        <PageForm
          formType="schema"
          onSubmit={handleSubmit}
          formTitle="Collection Schema"
          submitBtnText="Save Collections"
          setOpenedPanel={setOpenedPanel}
          extraButtons={[<NewSchemaModalBtn key="new-schema" />]}>
          {(collections && collections.length > 0) || (newCollectionEntry && newCollectionEntry.length > 0) ? (
            <Box>
              {collections && collections.map((entry, index: number) => (
                <CollectionEntry
                  key={index}
                  id={entry['_index']}
                  collectionStructure={collectionStructure}
                  openedPanelList={[openedPanel, setOpenedPanel]}
                  collectionEntryState={[entry, (updatedValue) =>
                    setCollections((prevCollection) => {
                      const collectionId = String(entry['_id']);
                      const updatedFields = Object.keys(prevCollection[index])
                        .reduce((acc: CollectionEntryData, key: string) => {
                          const updated_val = updatedValue[key];
                          if (prevCollection[index][key] !== updated_val) acc[key] = updated_val;
                          return acc;
                        }, {});
                      setUpdatedCollectionDetails((prevUpdate) => {
                        if (!(collectionId in prevUpdate)) prevUpdate[collectionId] = {};
                        return Object.entries(prevUpdate).reduce((acc: Record<string, NewCollectionInput>, [key, value]) => {
                          acc[key] = key === collectionId ? { ...value, ...updatedFields } : value;
                          return acc;
                        }, {});
                      });
                      return prevCollection.map((e, i) => (i === index ? updatedValue : e));
                    })
                  ]}
                  deleteEntry={() => {
                    deleteCollectionData(String(entry['_id']));
                    setOpenedPanel((p) => p.filter(panel => panel !== `panel${entry['_index']}`));
                  }}
                />
              ))}
              {newCollectionEntry && newCollectionEntry.map((newEntry, index: number) => (
                <CollectionEntry
                  key={index}
                  id={newEntry['_index']}
                  collectionStructure={collectionStructure}
                  openedPanelList={[openedPanel, setOpenedPanel]}
                  collectionEntryState={[newEntry, (updatedValue) =>
                    setNewCollectionEntry((prev) => prev.map((e, i) => (i === index ? updatedValue : e)))
                  ]}
                  deleteEntry={() => {
                    setOpenedPanel((p) => p.filter(panel => panel !== `panel${newEntry['_index']}`));
                    setNewCollectionEntry((prev) => prev.filter((_, _i) => _i !== index));
                  }}
                />
              ))}
            </Box>
          ) : (
            <Paper className="empty-container" elevation={1}>
              <Typography component="h3">No collections schema currently added, create a new schema.</Typography>
            </Paper>
          )}
          <Divider className="add-new-btn">
            <Fab color="primary" size="medium" aria-label="add" title="Add new variable" onClick={addNewEntry}>
              <AddIcon />
            </Fab>
          </Divider>
        </PageForm>
      ) : (
        <Box className="schema-component-skeleton">
          <Loading text="Loading collections…" />
        </Box>
      )}
    </>
  );
};
