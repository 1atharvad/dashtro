import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createDocument, deleteDocument, fetchCollection, fetchDocument,
  fetchDocumentVersions, restoreDocumentVersion, updateDocument, updateDocumentStatus,
  DocumentVersion,
} from '@/redux/documentSlice';
import { RootState, AppDispatch } from '@/redux/store';
import { unwrapResult } from '@reduxjs/toolkit';
import { toast } from 'advi-ui';

const EMPTY_PROJECT = { content: {} as Record<string, Record<string, any>>, ids: {} as Record<string, any> };

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
  const [collDocumentContent, setCollDocumentContent] = useState<Record<string, any>>({});
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
  }, [dispatch, projectId, workspaceName, collectionName, documentId]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching document data:", error);
      return;
    }
    if (loading1) return;

    if (documentId && documentId !== defaultId) {
      const docContent = projectData.content?.[collectionName]?.[documentId];
      if (!docContent) return;
      // Only push content into local state when this specific document's data arrives.
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
      const { _document_ids, _document_statuses } = projectData.ids[collectionName];
      setCollDocumentIds(prev => ({ ...prev, [collectionName]: _document_ids }));
      setCollDocumentStatuses(prev => ({ ...prev, [collectionName]: _document_statuses ?? {} }));
      setLoading2(false);
    }
  }, [loading1, projectData, error, collectionName, documentId]);

  const addDocumentData = async (newDocument: Record<string, any>) => {
    try {
      const resultAction = await dispatch(createDocument({ projectId, collectionName, workspaceName, newDocument }));
      toast.success('Document created');
      return unwrapResult(resultAction).data;
    } catch (err) {
      console.error(err);
      toast.error('Failed to create document');
    }
  };

  const updateDocumentData = async (updatedDocument: Record<string, any>) => {
    if (!documentId) return console.error("Document ID not found");
    try {
      await dispatch(updateDocument({ projectId, collectionName, documentId, workspaceName, updatedDocument }));
      toast.success('Document saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save document');
    }
  };

  const updateStatusData = (docId: string, status: 'draft' | 'published') => {
    dispatch(updateDocumentStatus({ projectId, collectionName, documentId: docId, workspaceName, status }))
      .then(() => toast.success(status === 'published' ? 'Marked as published' : 'Reverted to draft'))
      .catch(err => { console.error(err); toast.error('Failed to update status'); });
  };

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
    collDocumentContent,
    addDocumentData,
    updateDocumentData,
    updateStatusData,
    deleteDocumentData,
    fetchVersions,
    restoreVersion,
    versions,
    defaultId,
    loading: loading1 || loading2,
  };
};
