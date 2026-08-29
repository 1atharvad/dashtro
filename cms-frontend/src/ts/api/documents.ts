import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, stripEmpty } from '@ts/api/client';
import type { DocumentData, NewDocumentInput, CollectionMeta, DocumentVersion } from '@ts/types/constants';

const base = (projectId: string, workspaceName: string, collectionName: string) =>
  `/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}`;

export const documentKeys = {
  collection: (projectId: string, workspaceName: string, collectionName: string) =>
    ['documents', 'collection', projectId, workspaceName, collectionName] as const,
  detail: (projectId: string, workspaceName: string, collectionName: string, documentId: string) =>
    ['documents', 'detail', projectId, workspaceName, collectionName, documentId] as const,
  versions: (projectId: string, workspaceName: string, collectionName: string, documentId: string) =>
    ['documents', 'versions', projectId, workspaceName, collectionName, documentId] as const,
};

export const useCollectionMetaQuery = (
  projectId: string, workspaceName: string, collectionName: string, enabled: boolean
) => {
  return useQuery({
    queryKey: documentKeys.collection(projectId, workspaceName, collectionName),
    queryFn: () => apiRequest<CollectionMeta>(`${base(projectId, workspaceName, collectionName)}/`),
    enabled: enabled && !!projectId && !!collectionName,
  });
};

export const useDocumentQuery = (
  projectId: string, workspaceName: string, collectionName: string, documentId: string, enabled: boolean
) => {
  return useQuery({
    queryKey: documentKeys.detail(projectId, workspaceName, collectionName, documentId),
    queryFn: () => apiRequest<DocumentData>(
      `${base(projectId, workspaceName, collectionName)}/document/${documentId}/?depth=1`
    ),
    enabled: enabled && !!projectId && !!collectionName && !!documentId,
  });
};

export const useCreateDocumentMutation = (projectId: string, workspaceName: string, collectionName: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newDocument: NewDocumentInput) =>
      apiRequest<DocumentData>(`${base(projectId, workspaceName, collectionName)}/`, {
        method: 'POST',
        body: JSON.stringify(stripEmpty(newDocument)),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.collection(projectId, workspaceName, collectionName) });
      if (data._id) {
        queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, data._id), data);
      }
    },
  });
};

export const useUpdateDocumentMutation = (
  projectId: string, workspaceName: string, collectionName: string, documentId: string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updatedDocument: NewDocumentInput) =>
      apiRequest<DocumentData>(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/`, {
        method: 'PUT',
        body: JSON.stringify(updatedDocument),
      }),
    onSuccess: (data) => {
      const entry = { ...data };
      delete entry._id;
      queryClient.setQueryData(
        documentKeys.detail(projectId, workspaceName, collectionName, documentId),
        (prev: DocumentData | undefined) => ({ ...(prev ?? {}), ...entry })
      );
    },
  });
};

export const useDeleteDocumentMutation = (projectId: string, workspaceName: string, collectionName: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiRequest<void>(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: (_data, documentId) => {
      queryClient.setQueryData(
        documentKeys.collection(projectId, workspaceName, collectionName),
        (prev: CollectionMeta | undefined) => {
          if (!prev) return prev;
          const statuses = { ...prev._document_statuses };
          delete statuses[documentId];
          return {
            ...prev,
            _document_ids: prev._document_ids.filter((id) => id !== documentId),
            _document_statuses: statuses,
          };
        }
      );
    },
  });
};

export const useDocumentVersionsQuery = (
  projectId: string, workspaceName: string, collectionName: string, documentId: string
) => {
  return useQuery({
    queryKey: documentKeys.versions(projectId, workspaceName, collectionName, documentId),
    queryFn: () => apiRequest<DocumentVersion[]>(
      `${base(projectId, workspaceName, collectionName)}/document/${documentId}/versions/`
    ),
    enabled: false,
  });
};

export const useRestoreDocumentVersionMutation = (
  projectId: string, workspaceName: string, collectionName: string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, versionId }: { documentId: string; versionId: string }) =>
      apiRequest<DocumentData>(
        `${base(projectId, workspaceName, collectionName)}/document/${documentId}/versions/${versionId}/restore/`,
        { method: 'POST' }
      ),
    onSuccess: (data, { documentId }) => {
      const entry = { ...data };
      delete entry._id;
      queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, documentId), entry);
    },
  });
};

export const usePushCollectionToProdMutation = (projectId: string, workspaceName: string, collectionName: string) => {
  return useMutation({
    mutationFn: () =>
      apiRequest<unknown>(`${base(projectId, workspaceName, collectionName)}/push-to-prod/`, { method: 'POST' }),
  });
};

export const usePullCollectionFromProdMutation = (projectId: string, workspaceName: string, collectionName: string) => {
  return useMutation({
    mutationFn: (resolutions: Record<string, 'production' | 'workspace'>) =>
      apiRequest<unknown>(`${base(projectId, workspaceName, collectionName)}/pull-from-production/`, {
        method: 'POST',
        body: JSON.stringify({ resolutions }),
      }),
  });
};

export const usePushDocumentToProdMutation = (projectId: string, workspaceName: string, collectionName: string) => {
  return useMutation({
    mutationFn: (documentId: string) =>
      apiRequest<unknown>(
        `${base(projectId, workspaceName, collectionName)}/document/${documentId}/push-to-prod/`,
        { method: 'POST' }
      ),
  });
};

export const usePullDocumentFromProdMutation = (
  projectId: string, workspaceName: string, collectionName: string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiRequest<DocumentData>(
        `${base(projectId, workspaceName, collectionName)}/document/${documentId}/pull-from-production/`,
        { method: 'POST' }
      ),
    onSuccess: (data, documentId) => {
      const entry = { ...data };
      delete entry._id;
      queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, documentId), entry);
      queryClient.setQueryData(
        documentKeys.collection(projectId, workspaceName, collectionName),
        (prev: CollectionMeta | undefined) => {
          if (!prev?._document_statuses) return prev;
          return {
            ...prev,
            _document_statuses: { ...prev._document_statuses, [documentId]: entry._status ?? 'draft' },
          };
        }
      );
    },
  });
};
