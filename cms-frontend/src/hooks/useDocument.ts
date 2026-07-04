import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createDocument, deleteDocument, fetchCollection, fetchDocument,
  fetchDocumentVersions, restoreDocumentVersion, updateDocument,
  pushCollectionToProd, pullCollectionFromProd, pushDocumentToProd, pullDocumentFromProd,
  DocumentVersion,
} from '@/redux/documentSlice';
import type { RootState, AppDispatch, DocumentData, NewDocumentInput, CollectionMeta } from '@ts/types/constants';
import { unwrapResult } from '@reduxjs/toolkit';
import { toast } from 'advi-ui';

const EMPTY_PROJECT = {
  content: {} as Record<string, Record<string, DocumentData>>,
  ids: {} as Record<string, CollectionMeta>,
};

export const useDocumentData = (
  projectId: string,
  collectionName: string,
  workspaceName: string,
  documentId?: string
) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, versions: versionsMap, loading: loading1, error } = useSelector((state: RootState) => state.documents);

  // Stable reference — prevents effects from re-firing on every unrelated Redux action.
  const projectData = useMemo(
    () => byProject[projectId] ?? EMPTY_PROJECT,
    [byProject, projectId]
  );

  const [collDocumentIds, setCollDocumentIds] = useState<Record<string, string[]>>({});
  const [collDocumentStatuses, setCollDocumentStatuses] = useState<Record<string, Record<string, string>>>({});
  const [collDocumentLabels, setCollDocumentLabels] = useState<Record<string, Record<string, string>>>({});
  const [collDocumentContent, setCollDocumentContent] = useState<Record<string, Record<string, DocumentData>>>({});
  const [loading2, setLoading2] = useState(false);
  const defaultId = 'new';

  useEffect(() => {
    if (!projectId || !collectionName) return;
    if (documentId && documentId !== defaultId) {
      setLoading2(true);
      dispatch(fetchDocument({ projectId, collectionName, workspaceName, documentId }));
    } else if (!(collectionName in collDocumentIds)) {
      setLoading2(true);
      dispatch(fetchCollection({ projectId, collectionName, workspaceName }));
    }
  }, [dispatch, projectId, workspaceName, collectionName, documentId, collDocumentIds]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching document data:", error);
      setLoading2(false);
      return;
    }
    if (loading1) return;

    if (documentId && documentId !== defaultId) {
      const docContent = projectData.content?.[collectionName]?.[documentId];
      if (!docContent) return;
      setCollDocumentContent(prev => {
        const existing = prev[collectionName]?.[documentId];
        if (existing === docContent) return prev;
        return {
          ...prev,
          [collectionName]: { ...(prev[collectionName] ?? {}), [documentId]: docContent },
        };
      });
      setLoading2(false);
    } else if (collectionName in projectData.ids) {
      const { _document_ids, _document_statuses, _document_labels } = projectData.ids[collectionName];
      setCollDocumentIds(prev => ({ ...prev, [collectionName]: _document_ids }));
      setCollDocumentStatuses(prev => ({ ...prev, [collectionName]: _document_statuses ?? {} }));
      setCollDocumentLabels(prev => ({ ...prev, [collectionName]: _document_labels ?? {} }));
      setLoading2(false);
    }
  }, [loading1, projectData, error, collectionName, documentId]);

  const addDocumentData = async (newDocument: NewDocumentInput) => {
    try {
      const resultAction = await dispatch(createDocument({ projectId, collectionName, workspaceName, newDocument }));
      toast.success('Document created');
      return unwrapResult(resultAction).data;
    } catch (err) {
      console.error(err);
      toast.error('Failed to create document');
    }
  };

  const updateDocumentData = async (updatedDocument: NewDocumentInput) => {
    if (!documentId) return console.error("Document ID not found");
    try {
      await dispatch(updateDocument({ projectId, collectionName, documentId, workspaceName, updatedDocument }));
      toast.success('Document saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save document');
    }
  };

  const refreshCollection = () =>
    dispatch(fetchCollection({ projectId, collectionName, workspaceName }));

  const pushCollectionData = () =>
    dispatch(pushCollectionToProd({ projectId, collectionName, workspaceName }))
      .then(unwrapResult)
      .then(() => toast.success('Collection pushed to production'))
      .catch(err => { console.error(err); toast.error('Failed to push collection to production'); throw err; });

  const pullCollectionData = (resolutions: Record<string, 'production' | 'workspace'>) =>
    dispatch(pullCollectionFromProd({ projectId, collectionName, workspaceName, resolutions }))
      .then(unwrapResult)
      .then(() => toast.success('Collection updated from production'))
      .catch(err => { console.error(err); toast.error('Failed to pull collection from production'); throw err; });

  const pushDocumentData = (docId: string) =>
    dispatch(pushDocumentToProd({ projectId, collectionName, workspaceName, documentId: docId }))
      .then(unwrapResult)
      .then(() => toast.success('Document pushed to production'))
      .catch(err => { console.error(err); toast.error('Failed to push document to production'); throw err; });

  const pullDocumentData = (docId: string) =>
    dispatch(pullDocumentFromProd({ projectId, collectionName, workspaceName, documentId: docId }))
      .then(unwrapResult)
      .then(() => toast.success('Document updated from production'))
      .catch(err => { console.error(err); toast.error('Failed to pull document from production'); throw err; });

  const deleteDocumentData = (docId: string) => {
    dispatch(deleteDocument({ projectId, collectionName, documentId: docId, workspaceName }))
      .then(() => toast.success('Document deleted'))
      .catch(err => { console.error(err); toast.error('Failed to delete document'); });
  };

  const fetchVersions = (docId: string) => {
    dispatch(fetchDocumentVersions({ projectId, collectionName, documentId: docId, workspaceName }));
  };

  const restoreVersion = (docId: string, versionId: string) => {
    return dispatch(restoreDocumentVersion({ projectId, collectionName, documentId: docId, workspaceName, versionId }))
      .then(() => toast.success('Version restored'))
      .catch(err => { console.error(err); toast.error('Failed to restore version'); });
  };

  const versions: DocumentVersion[] = documentId ? (versionsMap[documentId] ?? []) : [];

  return {
    collDocumentIds,
    collDocumentStatuses,
    collDocumentLabels,
    collDocumentContent,
    addDocumentData,
    updateDocumentData,
    deleteDocumentData,
    refreshCollection,
    pushCollectionData,
    pullCollectionData,
    pushDocumentData,
    pullDocumentData,
    fetchVersions,
    restoreVersion,
    versions,
    defaultId,
    loading: loading1 || loading2,
  };
};
