import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createDocument, deleteDocument, fetchCollection, fetchDocument, updateDocument } from '@/redux/documentSlice';
import { RootState, AppDispatch } from '@/redux/store';
import { unwrapResult } from '@reduxjs/toolkit';

export const useDocumentData = (collectionName: string, workspaceName='production', documentId?: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const {documentData, loading: loading1, error} = useSelector((state: RootState) => state.documents);
  const [collDocumentIds, setCollDocumentIds] = useState<{[key: string]: string[]}>({});
  const [collDocumentContent, setCollDocumentContent] = useState<{[key: string]: any}>({});
  const [loading2, setLoading2] = useState<boolean>(false);
  const defaultId = 'new';
  // const [collectionStructure, setCollectionStructure] = useState<any>({});

  useEffect(() => {
    if (documentId && documentId !== defaultId) {
      setLoading2(true);

      if (!(collectionName in collDocumentContent)) {
        setCollDocumentContent(prevContent => ({
          ...prevContent,
          [collectionName]: {[documentId]: {}}
        }));
      } else if (!(documentId in collDocumentContent[collectionName])) {
        setCollDocumentContent(prevContent => ({
          ...prevContent,
          [collectionName]: {
            ...prevContent[collectionName],
            [documentId]: {}
          }
        }));
      }

      dispatch(fetchDocument({
        collectionName,
        workspaceName,
        documentId
      }));
    } else {
      if (!(collectionName in collDocumentIds)) {
        setLoading2(true);
        dispatch(fetchCollection({
          collectionName,
          workspaceName
        }));
      }
    }
  }, [dispatch, workspaceName, collectionName, documentId]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching data:", error);
    } else if (!loading1 && documentData) {
      if (documentId) {
        setCollDocumentContent(documentData['content']);
        setLoading2(false);
      } else {
        if (collectionName in documentData['ids']) {
          const { _document_ids } = documentData['ids'][collectionName];
          setCollDocumentIds(prevIds => {
            return {...prevIds, ...{[collectionName]: _document_ids}};
          });
          setLoading2(false);
        }
      }
    }
  }, [loading1, documentData, error]);

  const addDocumentData = async (newDocument: {[key: string]: any}) => {
    try {
      const resultAction = await dispatch(createDocument({
        collectionName,
        workspaceName,
        newDocument
      }));
      return unwrapResult(resultAction); 
    } catch (error) {
      return console.error("Error creating data:", error);
    }
  }

  const updateDocumentData = (updatedDocument: {[key: string]: any}) => {
    if (documentId)
      dispatch(updateDocument({
        collectionName,
        documentId,
        workspaceName,
        updatedDocument
      }))
        .catch(error => console.error("Error updating data:", error));
    else {
      return console.error("Document ID not found");
    }
  }

  const deleteDocumentData = (documentId: string) => {
    dispatch(deleteDocument({
        collectionName,
        documentId,
        workspaceName
      }))
      .catch(error => console.error("Error deleting data:", error));
  }

  return {
    collDocumentIds,
    collDocumentContent,
    addDocumentData,
    updateDocumentData,
    deleteDocumentData,
    defaultId,
    loading: (loading1 || loading2)
  };
};
