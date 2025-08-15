import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import { Box, Divider, Grid, Typography, useTheme } from '@mui/material';
import '@/scss/DocCollection.scss';
import { useCollectionData } from '@/hooks/useCollection';
import { useSchemaData } from '@/hooks/useSchema';
import { PageForm } from '@ts/components/PageForm';
import { DocumentEntry } from '@ts/components/DocumentEntry';
import { useDocumentData } from '@/hooks/useDocument';
import { Link } from '@ts/components/Link';

const PageNavigation = ({
  workspaceName,
  collectionName,
  documentId
}: {
  workspaceName: string,
  collectionName: string,
  documentId: string
}) => (
  <>
    <Link
        link={{
          text: collectionName,
          url: `/workspace/${workspaceName}/collection/${collectionName}/`,
          is_external_link: false
        }}
        className='navigation-link'>
      {collectionName}
    </Link> / {documentId}
  </>
);

export const DocumentContent = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [schema, setSchema] = useState<{[key: string]: any}[]>([]);
  const [emptyDocumentData, setEmptyDocumentData] = useState<{[key: string]: any}>({});
  const [documentData, setDocumentData] = useState<{[key: string]: any}>({});
  const {workspace_name, collection_name, document_id} = useParams();
  const {collections} = useCollectionData();
  const schemaName = collections.reduce((prevVal, currVal) => {
    return currVal['_collection_name'] === collection_name ? currVal['_schema_name'] : prevVal;
  }, '');
  const {schemaDetails, loading: loading1} = useSchemaData(schemaName);
  const {
    collDocumentContent,
    defaultId,
    addDocumentData,
    updateDocumentData,
    loading: loading2
  } = useDocumentData(
    collection_name || '',
    workspace_name || 'production',
    document_id
  );
  const [error, setError] = useState<string>('');
  const [updatedDocumentDetails, setUpdatedDocumentDetails] = useState<{[key: string]: any}>({});
  const maxDepth = 5;
  const loading = loading1 || loading2;

  useEffect(() => {
    if (!loading &&
        collection_name &&
        document_id !== defaultId &&
        document_id &&
        collection_name in collDocumentContent &&
        document_id in collDocumentContent[collection_name]
    ) {
      const content = collDocumentContent[collection_name][document_id];

      if ('error' in content) {
        setError(content['error'])
      } else {
        setDocumentData(content);
      }
    }
  }, [loading, collection_name, document_id, collDocumentContent]);

  useEffect(() => {
    if (!loading && Object.keys(schemaDetails).length) {
      setSchema(schemaDetails[schemaName]);
      setEmptyDocumentData(createEmptyDocumentData(schemaDetails, schemaName));
    }
  }, [loading, schemaDetails]);

  const createEmptyDocumentData = (schemaDetails: {[key: string]: any}, schemaName: string, depth = 0) => {
    const schemaData = schemaDetails[schemaName] as {[key: string]: any}[];

    if (schemaData) {
      return schemaData.reduce((accVal, currVal) => {
        const key = currVal['_name'];

        if (currVal['_nested_schema']) {
          accVal[key] = depth <= maxDepth
              ? createEmptyDocumentData(schemaDetails, currVal['_nested_schema'], depth + 1)
              : {};
        } else {
          accVal[key] = currVal['_type'] === 'Boolean'
              ? currVal['_default_value'] === 'True'
              : currVal['_default_value'];
        }
        return accVal;
      }, {});
    }

    return {};
  }

  const getDocumentId = (
    document_id: string,
    isTitle=false
  ) => {
    const id = document_id === defaultId ? 'New Document' : document_id;
    return !isTitle ? id.replace(/\s+/g, '') : id;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (document_id === defaultId) {
      addDocumentData(emptyDocumentData)
        .then(result => {
          const document_id = result['_id'];

          if (collection_name && document_id) {
            navigate(`/collection/${collection_name}/document/${document_id}/`);
          }
        });
    } else {
      updateDocumentData(updatedDocumentDetails);
    }
    console.log(emptyDocumentData, updatedDocumentDetails, 'hj')
  };

  return (
    <>
      {error == '' ? (
        !loading &&
          <Box className="document">
            <Box className="document-content">
              {schema && schema.length > 0 &&
                <PageForm
                    formType='document'
                    onSubmit={handleSubmit}
                    formTitle={getDocumentId(document_id || '', true)}
                    pageNavigation={<PageNavigation
                        workspaceName={workspace_name || 'production'}
                        collectionName={collection_name || ''}
                        documentId={getDocumentId(document_id || '')}/>}
                    submitBtnText='Save Document'>
                  <Grid container spacing={2} className="document-variable-container"
                      sx={{
                        background: theme.palette.background.paperLight,
                        '--border-color': theme.palette.borderColor
                      }}>
                    {schema && schema.map((entry: any, index: number) => (
                      <Grid key={index} className="document-variable">
                        <DocumentEntry
                            id={`variable-${entry['_index']}`}
                            variableSchema={entry}
                            variableEntryState={document_id === defaultId
                                ? [emptyDocumentData, (updatedValue) => {
                                    setEmptyDocumentData(updatedValue);
                                    return updatedValue;
                                  }]
                                : [documentData, (updatedValue) => {
                                    setDocumentData((prevDocumentData) => {
                                      const updatedFields = Object.keys(prevDocumentData)
                                        .reduce((acc: {[key: string]: string}, key: string) => {
                                          const updated_val = (updatedValue as {[key: string]: string})[key];

                                          if (prevDocumentData[key] !== updated_val) acc[key] = updated_val;
                                          return acc;
                                        }, {});

                                      setUpdatedDocumentDetails((prevUpdate) => {
                                        return {...prevUpdate, ...updatedFields};
                                      })

                                        console.log(updatedFields)

                                      return updatedValue
                                    });
                                    return updatedValue;
                                  }]}
                            schemaDetails={schemaDetails}/>
                        {index < schema.length - 1 && entry['_type'] !== 'NestedDocument' && <Divider/>}
                      </Grid>
                    ))}
                  </Grid>
                </PageForm>
              }
            </Box>
          </Box>
        ) : (
          <Box className="document-error">
            <Typography component="p">{error}</Typography>
          </Box>
        )
      }
    </>
  )
}