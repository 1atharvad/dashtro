import {ChangeEvent, FormEvent, useEffect, useState} from 'react';
import {
  Box,
  Button,
  Divider,
  Fab,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from '@mui/icons-material';
import { CollectionEntry } from '@ts/components/CollectionEntry';
import { PageForm } from '@ts/components/PageForm';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';
import { useNavigate } from 'react-router-dom';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { useCollectionData } from '@/hooks/useCollection';
import { RootState } from '@/redux/store';
import { useSelector } from "react-redux";

const newSchemaModelBtn = () => {
  const navigate = useNavigate();
  const [closeModal, setCloseModal] = useState<boolean>(false);
  const [labelValue, setLabelValue] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const {schemaNames} = useSchemaMetaData();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const {value} = event.target;
    setLabelValue(value);
    setErrorMessage('');
  };

  const addNewSchema = (event: any) => {
    event.preventDefault();
    event.stopPropagation();
    const error_message = handleValidation();

    if (error_message.length == 0) {
      setCloseModal(true);
      navigate(`/schema/${labelValue}/`);
      setTimeout(setCloseModal.bind(null, false), 0);
    } else {
      setErrorMessage(error_message)
    }
  };

  const handleValidation = () => {
    if (labelValue === '') {
      return 'Schema name required.';
    } else if (schemaNames.includes(labelValue)) {
      return `${labelValue} schema already exists. Try creating with the different name.`;
    }
    return ''
  }

  return (
    <ModalContentBtn id='new-schema' modalTitle='Create New Schema' modalBtn={(handleClick) => (
      <Button variant='contained' color='primary' onClick={handleClick}>
        Add new Schema
      </Button>
    )} closeModal={closeModal}>
      <Box component="form" className='new-schema-model' onSubmit={addNewSchema}>
        <TextField
            id='new-schema-name'
            name='new-schema-name'
            label='Schema Name'
            value={labelValue}
            variant="outlined"
            onChange={handleChange}
            sx={{width: '100%'}}
            error={errorMessage !== ''}
            helperText={errorMessage}
            required/>
        <Button
            type="submit"
            variant="contained"
            color="success"
            className='new-schema-model-save-btn'
            startIcon={<AddIcon/>}>
          Save Schema Name
        </Button>
      </Box>
    </ModalContentBtn>
  )
}

export const CollectionComponent = ({MenuIcon}: {MenuIcon: () => JSX.Element}) => {
  const {
    collections: collectionsData,
    collectionStructure,
    loading,
    addCollectionData,
    updateCollectionData,
    deleteCollectionData
  } = useCollectionData();
  const [collections, setCollections] = useState<{[key: string]: any}[]>([]);
  const [emptyCollectionEntry, setEmptyCollectionEntry] = useState<{[key: string]: any}>({});
  const [updatedCollectionDetails, setUpdatedCollectionDetails] = useState<{[key: string]: any}>({});
  const [newCollectionEntry, setNewCollectionEntry] = useState<{[key: string]: any}[]>([]);
  const [openedPanel, setOpenedPanel] = useState<string[]>([]);

  useEffect(() => {
    if (!loading) {
      setCollections(collectionsData);
      setNewCollectionEntry([]);
      setEmptyCollectionEntry(
        Object.entries(collectionStructure).reduce((acc: any, [_key, value]: [string, any]) => {
          acc[_key] = value.default || "";
          return acc;
        }, {})
      );
    }
  }, [loading, collectionsData]);

  const addNewEntry = (event: any) => {
    event.preventDefault();
    setNewCollectionEntry((prev) => [...prev, Object.entries(emptyCollectionEntry).reduce((acc: any, [_key, value]: [string, any]) => {
      if (_key === '_index') {
        const index = collections.length + newCollectionEntry.length + 1;
        acc[_key] = index;
      } else acc[_key] = value
      console.log(acc, _key)
      return acc;
    }, {})]);
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    console.log("Form Data Submitted:", newCollectionEntry, collections, updatedCollectionDetails);
    addCollectionData(newCollectionEntry)
    updateCollectionData(updatedCollectionDetails);
    setUpdatedCollectionDetails({});
  };

  return (
    <>
      {!loading ? (
        <PageForm
            formType='schema'
            onSubmit={handleSubmit}
            formTitle='Collection Entities'
            submitBtnText='Save Collections'
            MenuIcon={MenuIcon}
            setOpenedPanel={setOpenedPanel}
            extraButtons={[newSchemaModelBtn]}>
          {(collections && collections.length > 0) ||
              (newCollectionEntry && newCollectionEntry.length > 0) ? (
            <Box>
              {collections && collections.map((entry: any, index: number) => (
                <CollectionEntry
                    key={index}
                    id={entry['_index']}
                    collectionStructure={collectionStructure}
                    openedPanelList={[openedPanel, setOpenedPanel]}
                    collectionEntryState={[entry, (updatedValue) =>
                      setCollections((prevCollection) => {
                        const collectionId = entry['_id'];
                        const updatedFields = Object.keys(prevCollection[index])
                          .reduce((acc: {[key: string]: string}, key: string) => {
                            const updated_val = (updatedValue as {[key: string]: string})[key];

                            if (prevCollection[index][key] !== updated_val) acc[key] = updated_val;
                            return acc;
                          }, {});

                        setUpdatedCollectionDetails((prevUpdate) => {
                          if (!(collectionId in prevUpdate)) prevUpdate[collectionId] = {};

                          return Object.entries(prevUpdate).reduce((acc: {[key: string]: any}, [_key, value]) => {
                            acc[_key] = _key === collectionId ? {...value, ...updatedFields} : value;
                            return acc;
                          }, {});
                        });
                        return prevCollection.map((e, i) => (i === index ? updatedValue : e));
                      })
                    ]}
                    deleteEntry={() => {
                      deleteCollectionData(entry['_id']);
                      setOpenedPanel((openPanels) => openPanels.filter(panel => panel !== `panel${entry['_index']}`));
                    }}
                />
              ))}
              {newCollectionEntry && newCollectionEntry.map((newEntry: any, index: number) => (
                <CollectionEntry
                    key={index}
                    id={newEntry['_index']}
                    collectionStructure={collectionStructure}
                    openedPanelList={[openedPanel, setOpenedPanel]}
                    collectionEntryState={[newEntry, (updatedValue) =>
                      setNewCollectionEntry((prevSchema) =>
                        prevSchema.map((e, i) => (i === index ? updatedValue : e))
                      )
                    ]}
                    deleteEntry={() => {
                      setOpenedPanel((openPanels) => openPanels.filter(panel => panel !== `panel${newEntry['_index']}`));
                      setNewCollectionEntry((prevNewEntry) => prevNewEntry.filter((_, _index) => _index !== index));
                    }}
                />
              ))}
            </Box>
          ) : (
            <Box className='empty-container'>
              <Typography component='h3'>No collections currently added, create a new collection.</Typography>
            </Box>
          )}
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