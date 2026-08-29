import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, stripEmpty } from '@ts/api/client';
import type {
  SchemaCollectionItem, NewCollectionInput, CollectionsResponse,
} from '@ts/types/constants';

export const collectionKeys = {
  byProject: (projectId: string) => ['collections', projectId] as const,
};

export const useCollectionsQuery = (projectId: string) => {
  return useQuery({
    queryKey: collectionKeys.byProject(projectId),
    queryFn: () => apiRequest<CollectionsResponse>(`/projects/${projectId}/collections/`),
    enabled: !!projectId,
  });
};

export const useCreateCollectionMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newCollection: NewCollectionInput) =>
      apiRequest<CollectionsResponse>(`/projects/${projectId}/collections/`, {
        method: 'POST',
        body: JSON.stringify(stripEmpty(newCollection)),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.byProject(projectId) }),
  });
};

export const useUpdateCollectionMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId, updatedCollection,
    }: { collectionId: string; updatedCollection: NewCollectionInput }) =>
      apiRequest<SchemaCollectionItem>(`/projects/${projectId}/collections/${collectionId}/`, {
        method: 'PUT',
        body: JSON.stringify(updatedCollection),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.byProject(projectId) }),
  });
};

export const useDeleteCollectionMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) =>
      apiRequest<void>(`/projects/${projectId}/collections/${collectionId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.byProject(projectId) }),
  });
};
