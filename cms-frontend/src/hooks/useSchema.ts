import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createSchema, fetchSchema, updateSchema, deleteSchema } from '@/redux/schemaSlice';
import { RootState, AppDispatch } from '@/redux/store';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';

export const useSchemaData = (schemaName: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { schemaData, loading, error } = useSelector((state: RootState) => state.schema);

  const {schemaNames, addNewSchemeName, removeSchemaName} = useSchemaMetaData();
  const [schemaNameData, setSchemaNameData] = useState<{[key: string]: any}[]>([]);
  const [schemaDetails, setSchemaDetails] = useState<{[key: string]: any}>({});
  const [schemaList, setSchemaList] = useState<string[]>([]);
  const [currSchemaList, setCurrSchemaList] = useState<string[]>([]);
  const _loading = loading || !(schemaName in schemaData);

  useEffect(() => {
    setCurrSchemaList([]);
    setSchemaDetails({});
  }, [schemaName]);

  useEffect(() => {
    if (!schemaList.includes(schemaName) && schemaNames.includes(schemaName)) {
      setSchemaList(prevSchemaList => [...prevSchemaList, schemaName]);
      setCurrSchemaList(prevSchemaList => [...prevSchemaList, schemaName]);
      dispatch(fetchSchema(schemaName));
    }
  }, [dispatch, schemaName, schemaNames]);

  const getNestedSchema = (schemaInfo: {[key: string]: any}) => {
    schemaInfo.map((schemaVariable: {[key: string]: any}) => {
      const nestedSchemaName = schemaVariable['_nested_schema'];

      if (!schemaList.includes(nestedSchemaName) && schemaNames.includes(nestedSchemaName)) {
        setSchemaList(prevSchemaList => [...prevSchemaList, nestedSchemaName]);
        setCurrSchemaList(prevSchemaList => [...prevSchemaList, nestedSchemaName]);
        dispatch(fetchSchema(nestedSchemaName));
      }      
    });
  }

  useEffect(() => {
    if (error) {
      console.error("Error fetching data:", error);
    } else if (!_loading && schemaData && schemaName in schemaData) {
      setSchemaNameData(schemaData[schemaName]);
      getNestedSchema(schemaData[schemaName]);
    }
  }, [_loading, schemaData, error, schemaName, schemaDetails]);

  useEffect(() => {
    if (!loading) {
      const updatedSchemaDetails = currSchemaList
        .filter(schemaName =>
          Object.keys(schemaData).includes(schemaName) &&
          !Object.keys(schemaDetails).includes(schemaName))
        .reduce((accVal: {[key: string]: any}, currVal) => {
          accVal[currVal] = schemaData[currVal];
          getNestedSchema(schemaData[currVal]);
          return accVal;
        }, { ...schemaDetails });

      setSchemaDetails(updatedSchemaDetails);
    }
  }, [_loading, schemaData, currSchemaList]);

  const updateSchemaData = (updatedSchemaDetails: {[key: string]: any}) => {
    Promise.all(Object.entries(updatedSchemaDetails).map(([schemaId, updatedSchema]) => 
      dispatch(updateSchema({schemaId, updatedSchema}))
        .catch(error => console.error("Error updating data:", error))
    ));
  }

  const addSchemaData = (newSchemaDetails: {[key: string]: any}[]) => {
    Promise.all(newSchemaDetails.map(newSchema =>
      dispatch(createSchema(newSchema))
        .catch(error => console.error("Error creating data:", error))
    ))
    .then(() => {
      if (!schemaNames.includes(schemaName)) addNewSchemeName(schemaName);
    });
  }

  const deleteSchemaData = (schemaId: string) => {
    dispatch(deleteSchema({schemaId, schemaName}))
      .then(() => {
        if (schemaData[schemaName].length === 1) removeSchemaName(schemaName);
      })
      .catch(error => console.error("Error deleting data:", error))
  }

  return {schemaNameData, schemaDetails, loading: _loading && Object.keys(schemaDetails) === currSchemaList, updateSchemaData, addSchemaData, deleteSchemaData };
};
