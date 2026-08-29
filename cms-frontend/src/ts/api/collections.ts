import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type {
  SchemaCollectionItem, NewCollectionInput, CollectionsResponse,
} from '@ts/types/constants';

export const collectionKeys = {
  byProject: (projectId: string) => ['collections', projectId] as const,
};

export function useCollectionsQuery(projectId: string) {
  return useQuery({
    queryKey: collectionKeys.byProject(projectId),
    queryFn: () => apiRequest<CollectionsResponse>(`/projects/${projectId}/collections/`),
    enabled: !!projectId,
  });
}

// Strips empty-string fields so the backend sees only intentionally-set values.
const stripEmpty = (input: NewCollectionInput): Record<string, string | number> =>
  Object.entries(input).reduce((acc: Record<string, string | number>, [key, value]) => {
    if (value !== '') acc[key] = value as string | number;
    return acc;
  }, {});

export function useCreateCollectionMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newCollection: NewCollectionInput) =>
      apiRequest<CollectionsResponse>(`/projects/${projectId}/collections/`, {
        method: 'POST',
        body: JSON.stringify(stripEmpty(newCollection)),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.byProject(projectId) }),
  });
}

export function useUpdateCollectionMutation(projectId: string) {
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
}

export function useDeleteCollectionMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) =>
      apiRequest<void>(`/projects/${projectId}/collections/${collectionId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.byProject(projectId) }),
  });
}
