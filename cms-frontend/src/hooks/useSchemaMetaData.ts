import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchema, updateSchemaNames } from '@/redux/schemaPresetSlice';
import { RootState, AppDispatch } from '@/redux/store';

export const useSchemaMetaData = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading, error } = useSelector((state: RootState) => state.schema_preset);
  const projectData = byProject[projectId];

  // Derive directly from Redux so all hook instances stay in sync immediately —
  // no local state copy that lags by a render cycle on add/remove.
  const schemaNames: string[] = projectData?._schema_names ?? [];
  const schemaVariables: Record<string, any> = projectData?._schema_variables ?? {};

  useEffect(() => {
    if (projectId && !projectData) {
      dispatch(fetchSchema(projectId));
    }
  }, [dispatch, projectId, projectData]);

  useEffect(() => {
    if (error) console.error("Error fetching schema metadata:", error);
  }, [error]);

  const addNewSchemeName = (schemaName: string) => {
    if (!schemaNames.includes(schemaName)) {
      dispatch(updateSchemaNames({ projectId, names: [...schemaNames, schemaName] }));
    }
  };

  const removeSchemaName = (schemaName: string) => {
    dispatch(updateSchemaNames({ projectId, names: schemaNames.filter(n => n !== schemaName) }));
  };

  return { schemaNames, addNewSchemeName, removeSchemaName, schemaVariables, loading: loading || !projectData };
};
