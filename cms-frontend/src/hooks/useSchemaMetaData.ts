import { useEffect } from 'react';
import { useSchemaPresetQuery, useSchemaPresetCache } from '@ts/api/schemaPresets';
import type { SchemaVariablesSchema } from '@ts/types/constants';

// Stable fallbacks: `data?.x ?? []` creates a new array/object on every
// render while data is still loading, which breaks referential equality for
// any effect depending on schemaNames/schemaVariables (infinite render loop).
const EMPTY_SCHEMA_NAMES: string[] = [];
const EMPTY_SCHEMA_VARIABLES: SchemaVariablesSchema = {};

export const useSchemaMetaData = (projectId: string) => {
  const { data, isLoading: loading, error } = useSchemaPresetQuery(projectId);
  const { setSchemaNames } = useSchemaPresetCache(projectId);

  // Derive directly from the query cache so all hook instances stay in sync
  // immediately — no local state copy that lags by a render cycle on add/remove.
  const schemaNames: string[] = data?._schema_names ?? EMPTY_SCHEMA_NAMES;
  const schemaVariables: SchemaVariablesSchema = data?._schema_variables ?? EMPTY_SCHEMA_VARIABLES;

  useEffect(() => {
    if (error) console.error("Error fetching schema metadata:", error);
  }, [error]);

  const addNewSchemeName = (schemaName: string) => {
    if (!schemaNames.includes(schemaName)) {
      setSchemaNames([...schemaNames, schemaName]);
    }
  };

  const removeSchemaName = (schemaName: string) => {
    setSchemaNames(schemaNames.filter(n => n !== schemaName));
  };

  return { schemaNames, addNewSchemeName, removeSchemaName, schemaVariables, loading };
};
