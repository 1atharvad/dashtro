import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchema } from '@/redux/schemaPresetSlice';
import { updateSchemaNames } from '@/redux/schemaPresetSlice';
import { RootState, AppDispatch } from '@/redux/store';

export const useSchemaMetaData = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { schemaData, loading, error } = useSelector((state: RootState) => state.schema_preset);

  const [schemaNames, setSchemaNames] = useState<string[]>([]);
  const [schemaVariables, setSchemaVariables] = useState<Record<string, any>>({});
  const _loading = loading || schemaNames.length == 0 || Object.keys(schemaVariables).length == 0;

  useEffect(() => {
    if (!Object.keys(schemaData).length && loading) {
      dispatch(fetchSchema());
    }
  }, [dispatch, schemaData, loading]);

  useEffect(() => {
    if (error) {
      console.error("Error fetching data:", error);
    } else if (!loading && schemaData && Object.keys(schemaData).length > 0) {
      const { _schema_names, _schema_variables } = schemaData;
      setSchemaNames(_schema_names);
      setSchemaVariables(_schema_variables);
    }
  }, [loading, schemaData, error]);

  const addNewSchemeName = (schemaName: string) => {
    if (!schemaNames.includes(schemaName)) {
      setSchemaNames([...schemaNames, schemaName]);
      dispatch(updateSchemaNames([...schemaNames, schemaName]));
    } 
  }

  const removeSchemaName = (schemaName: string) => {
    const updatedSchemaNames = schemaNames.filter((name: string) => name !== schemaName);
    setSchemaNames(updatedSchemaNames);
    dispatch(updateSchemaNames(updatedSchemaNames))
  }

  return { schemaNames, addNewSchemeName, removeSchemaName, schemaVariables, loading: _loading };
};
