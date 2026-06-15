import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createCollection, fetchCollections, updateCollection, deleteCollection } from '@/redux/collectionSlice';
import { RootState, AppDispatch } from '@/redux/store';
import { toast } from 'advi-ui';

export const useCollectionData = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading, error } = useSelector((state: RootState) => state.collections);
  const projectData = byProject[projectId];

  const collections: Record<string, any>[] = projectData?._schema_collections ?? [];
  const collectionStructure: any = projectData?._collection_schema_variables ?? {};

  useEffect(() => {
    if (projectId) dispatch(fetchCollections(projectId));
  }, [dispatch, projectId]);

  useEffect(() => {
    if (error) console.error("Error fetching collections:", error);
  }, [error]);

  const addCollectionData = (newCollectionDetails: Record<string, any>[]) => {
    Promise.all(
      newCollectionDetails.map(newCollection =>
        dispatch(createCollection({ projectId, newCollection }))
          .catch(err => { console.error(err); toast.error('Failed to create collection'); })
      )
    ).then(() => toast.success('Collection created'));
  };

  const updateCollectionData = (updatedCollectionDetails: Record<string, any>) => {
    Promise.all(
      Object.entries(updatedCollectionDetails).map(([collectionId, updatedCollection]) =>
        dispatch(updateCollection({ projectId, collectionId, updatedCollection }))
          .catch(err => { console.error(err); toast.error('Failed to update collection'); })
      )
    ).then(() => toast.success('Collection saved'));
  };

  const deleteCollectionData = (collectionId: string) => {
    dispatch(deleteCollection({ projectId, collectionId }))
      .then(() => toast.success('Collection deleted'))
      .catch(err => { console.error(err); toast.error('Failed to delete collection'); });
  };

  return { collections, collectionStructure, loading, addCollectionData, updateCollectionData, deleteCollectionData };
};
