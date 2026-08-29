import { useEffect } from 'react';
import {
  useCollectionsQuery, useCreateCollectionMutation, useUpdateCollectionMutation, useDeleteCollectionMutation,
} from '@ts/api/collections';
import type { SchemaCollectionItem, CollectionUiSchema, NewCollectionInput } from '@ts/types/constants';
import { toast } from 'advi-ui';

export const useCollectionData = (projectId: string) => {
  const { data, isLoading: loading, error } = useCollectionsQuery(projectId);
  const createMutation = useCreateCollectionMutation(projectId);
  const updateMutation = useUpdateCollectionMutation(projectId);
  const deleteMutation = useDeleteCollectionMutation(projectId);

  const collections: SchemaCollectionItem[] = data?._schema_collections ?? [];
  const collectionStructure: CollectionUiSchema = data?._collection_schema_variables ?? {};

  useEffect(() => {
    if (error) console.error("Error fetching collections:", error);
  }, [error]);

  const addCollectionData = (newCollectionDetails: NewCollectionInput[]) => {
    Promise.all(
      newCollectionDetails.map(newCollection =>
        createMutation.mutateAsync(newCollection)
          .catch(err => { console.error(err); toast.error('Failed to create collection'); })
      )
    ).then(() => toast.success('Collection created'));
  };

  const updateCollectionData = (updatedCollectionDetails: Record<string, NewCollectionInput>) => {
    Promise.all(
      Object.entries(updatedCollectionDetails).map(([collectionId, updatedCollection]) =>
        updateMutation.mutateAsync({ collectionId, updatedCollection })
          .catch(err => { console.error(err); toast.error('Failed to update collection'); })
      )
    ).then(() => toast.success('Collection saved'));
  };

  const deleteCollectionData = (collectionId: string) =>
    deleteMutation.mutateAsync(collectionId)
      .then(() => toast.success('Collection deleted'))
      .catch(err => { console.error(err); toast.error('Failed to delete collection'); });

  return { collections, collectionStructure, loading, addCollectionData, updateCollectionData, deleteCollectionData };
};
