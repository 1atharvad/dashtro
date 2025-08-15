import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createCollection, fetchCollections, updateCollection, deleteCollection } from '@/redux/collectionSlice';
import { RootState, AppDispatch } from '@/redux/store';

export const useCollectionData = () => {
  const dispatch = useDispatch<AppDispatch>();
  const {collectionData, loading, error} = useSelector((state: RootState) => state.collections);
  const [collections, setCollections] = useState<{[key: string]: any}[]>([]);
  const [collectionStructure, setCollectionStructure] = useState<any>({});

  useEffect(() => {
    dispatch(fetchCollections());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching data:", error);
    } else if (!loading && collectionData) {
      const { _schema_collections, _collection_schema_variables } = collectionData;
      setCollections(_schema_collections);
      setCollectionStructure(_collection_schema_variables);
    }
  }, [collectionData, error]);

  const addCollectionData = (newCollectionDetails: {[key: string]: any}[]) => {
    Promise.all(newCollectionDetails.map(newCollection =>
      dispatch(createCollection(newCollection))
        .catch(error => console.error("Error creating data:", error))
    ));
  }

  const updateCollectionData = (updatedCollectionDetails: {[key: string]: any}) => {
    Promise.all(Object.entries(updatedCollectionDetails).map(([collectionId, updatedCollection]) =>
      dispatch(updateCollection({collectionId, updatedCollection}))
        .catch(error => console.error("Error updating data:", error))
    ));
  }

  const deleteCollectionData = (collectionId: string) => {
    dispatch(deleteCollection(collectionId))
      .catch(error => console.error("Error deleting data:", error));
  }

  return {collections, collectionStructure, loading, addCollectionData, updateCollectionData, deleteCollectionData};
};
