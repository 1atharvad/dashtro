import { useEffect, useMemo } from 'react';
import {
  useCollectionMetaQuery, useDocumentQuery, useCreateDocumentMutation, useUpdateDocumentMutation,
  useDeleteDocumentMutation, useDocumentVersionsQuery, useRestoreDocumentVersionMutation,
  usePushCollectionToProdMutation, usePullCollectionFromProdMutation,
  usePushDocumentToProdMutation, usePullDocumentFromProdMutation,
} from '@ts/api/documents';
import type { DocumentData, NewDocumentInput, DocumentVersion } from '@ts/types/constants';
import { toast } from 'advi-ui';

export const useDocumentData = (
  projectId: string,
  collectionName: string,
  workspaceName: string,
  documentId?: string
) => {
  const defaultId = 'new';
  const wantsDocument = !!documentId && documentId !== defaultId;

  const metaQuery = useCollectionMetaQuery(projectId, workspaceName, collectionName, !wantsDocument);
  const documentQuery = useDocumentQuery(projectId, workspaceName, collectionName, documentId ?? '', wantsDocument);
  const versionsQuery = useDocumentVersionsQuery(projectId, workspaceName, collectionName, documentId ?? '');

  const createMutation = useCreateDocumentMutation(projectId, workspaceName, collectionName);
  const updateMutation = useUpdateDocumentMutation(projectId, workspaceName, collectionName, documentId ?? '');
  const deleteMutation = useDeleteDocumentMutation(projectId, workspaceName, collectionName);
  const restoreVersionMutation = useRestoreDocumentVersionMutation(projectId, workspaceName, collectionName);
  const pushCollectionMutation = usePushCollectionToProdMutation(projectId, workspaceName, collectionName);
  const pullCollectionMutation = usePullCollectionFromProdMutation(projectId, workspaceName, collectionName);
  const pushDocumentMutation = usePushDocumentToProdMutation(projectId, workspaceName, collectionName);
  const pullDocumentMutation = usePullDocumentFromProdMutation(projectId, workspaceName, collectionName);

  const meta = metaQuery.data;
  const collDocumentIds = useMemo(
    () => (meta ? { [collectionName]: meta._document_ids } : {}),
    [meta, collectionName]
  );
  const collDocumentStatuses = useMemo(
    () => (meta ? { [collectionName]: meta._document_statuses ?? {} } : {}),
    [meta, collectionName]
  );
  const collDocumentLabels = useMemo(
    () => (meta ? { [collectionName]: meta._document_labels ?? {} } : {}),
    [meta, collectionName]
  );
  const collDocumentContent = useMemo(
    () => (documentId && documentQuery.data ? { [collectionName]: { [documentId]: documentQuery.data } } : {}),
    [documentQuery.data, collectionName, documentId]
  );

  const error = metaQuery.error ?? documentQuery.error;
  useEffect(() => {
    if (error) console.error("Error fetching document data:", error);
  }, [error]);

  const loading = wantsDocument ? documentQuery.isLoading : metaQuery.isLoading;

  const addDocumentData = async (newDocument: NewDocumentInput): Promise<DocumentData | undefined> => {
    try {
      const data = await createMutation.mutateAsync(newDocument);
      toast.success('Document created');
      return data;
    } catch (err) {
      console.error(err);
      toast.error('Failed to create document');
    }
  };

  const updateDocumentData = async (updatedDocument: NewDocumentInput) => {
    if (!documentId) return console.error("Document ID not found");
    try {
      await updateMutation.mutateAsync(updatedDocument);
      toast.success('Document saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save document');
    }
  };

  const refreshCollection = () => metaQuery.refetch();

  const pushCollectionData = () =>
    pushCollectionMutation.mutateAsync()
      .then(() => toast.success('Collection pushed to production'))
      .catch(err => { console.error(err); toast.error('Failed to push collection to production'); throw err; });

  const pullCollectionData = (resolutions: Record<string, 'production' | 'workspace'>) =>
    pullCollectionMutation.mutateAsync(resolutions)
      .then(() => toast.success('Collection updated from production'))
      .catch(err => { console.error(err); toast.error('Failed to pull collection from production'); throw err; });

  const pushDocumentData = (docId: string) =>
    pushDocumentMutation.mutateAsync(docId)
      .then(() => toast.success('Document pushed to production'))
      .catch(err => { console.error(err); toast.error('Failed to push document to production'); throw err; });

  const pullDocumentData = (docId: string) =>
    pullDocumentMutation.mutateAsync(docId)
      .then(() => toast.success('Document updated from production'))
      .catch(err => { console.error(err); toast.error('Failed to pull document from production'); throw err; });

  const deleteDocumentData = (docId: string): Promise<boolean> =>
    deleteMutation.mutateAsync(docId)
      .then(() => { toast.success('Document deleted'); return true; })
      .catch(err => { console.error(err); toast.error('Failed to delete document'); return false; });

  const fetchVersions = (docId: string) => {
    if (docId === documentId) versionsQuery.refetch();
  };

  const restoreVersion = (docId: string, versionId: string) =>
    restoreVersionMutation.mutateAsync({ documentId: docId, versionId })
      .then(() => toast.success('Version restored'))
      .catch(err => { console.error(err); toast.error('Failed to restore version'); });

  const versions: DocumentVersion[] = versionsQuery.data ?? [];

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
    loading,
  };
};
