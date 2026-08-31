import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import {
  schemaKeys, useCreateSchemaFieldMutation, useUpdateSchemaFieldMutation, useDeleteSchemaFieldMutation,
} from '@ts/api/schema';
import type { SchemaFieldItem, NewSchemaFieldInput } from '@ts/types/constants';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { toast } from 'advi-ui';

// Stable fallback: `schemaDetails[schemaName] ?? []` creates a new array on
// every render while the schema hasn't fetched yet, which breaks referential
// equality for any effect depending on schemaNameData (infinite render loop).
const EMPTY_SCHEMA_FIELDS: SchemaFieldItem[] = [];

/**
 * Manages schema data for a single schema within a project.
 *
 * Responsibilities:
 * - Fetches the root schema and any schemas directly referenced as nested
 *   document fields (one level deep only).
 * - Resets the fetched-schema set when `schemaName` changes so stale data
 *   from a previous schema never bleeds into the new one.
 * - Exposes CRUD helpers that mutate via TanStack Query and show toast feedback.
 *
 * @param projectId - The project to load schema data for.
 * @param schemaName - The specific schema to load (e.g. "Article", "Author").
 * @param isNewSchema - True when the caller already knows this schema hasn't
 *   been created yet (e.g. the URL was navigated to ahead of the first save).
 *   Skips the fetch entirely instead of firing a request guaranteed to 404.
 */
export const useSchemaData = (projectId: string, schemaName: string, isNewSchema = false) => {
  const { schemaNames, addNewSchemeName, removeSchemaName } = useSchemaMetaData(projectId);
  const [requestedNames, setRequestedNames] = useState<string[]>(
    schemaName && !isNewSchema ? [schemaName] : []
  );

  const createMutation = useCreateSchemaFieldMutation(projectId);
  const updateMutation = useUpdateSchemaFieldMutation(projectId);
  const deleteMutation = useDeleteSchemaFieldMutation(projectId);

  /** Runs when the user navigates to a different schema; drops all previously-requested names. */
  useEffect(() => {
    setRequestedNames(schemaName && !isNewSchema ? [schemaName] : []);
  }, [schemaName, isNewSchema]);

  const queries = useQueries({
    queries: requestedNames.map((name) => ({
      queryKey: schemaKeys.detail(projectId, name),
      queryFn: () =>
        apiRequest<Record<string, SchemaFieldItem[]>>(`/projects/${projectId}/schema/${name}/`)
          .then((data) => data[name] ?? []),
      enabled: !!projectId && !!name,
    })),
  });

  const schemaDetails = useMemo(
    () => requestedNames.reduce((acc: Record<string, SchemaFieldItem[]>, name, i) => {
      const data = queries[i]?.data;
      if (data) acc[name] = data;
      return acc;
    }, {}),
    [requestedNames, queries]
  );

  const error = queries.find((q) => q.error)?.error;
  useEffect(() => {
    if (error) console.error("Error fetching schema data:", error);
  }, [error]);

  /**
   * Walks every schema currently in schemaDetails and queues any
   * `_nested_schema` reference not yet fetched, as long as it's a known
   * schema name (self-references and unknown/stale names are skipped).
   * This lets DocumentEntry render deeply nested document fields (A → B → C).
   */
  useEffect(() => {
    const toAdd = new Set<string>();
    Object.values(schemaDetails).forEach((fields) => {
      fields?.forEach((field) => {
        const nested = field._nested_schema;
        if (nested && nested !== schemaName && schemaNames.includes(nested) && !requestedNames.includes(nested)) {
          toAdd.add(nested);
        }
      });
    });
    if (toAdd.size > 0) setRequestedNames((prev) => [...prev, ...toAdd]);
  }, [schemaDetails, schemaName, schemaNames, requestedNames]);

  const schemaNameData: SchemaFieldItem[] = schemaDetails[schemaName] ?? EMPTY_SCHEMA_FIELDS;
  const loading = isNewSchema ? false : !(schemaName in schemaDetails);

  /**
   * Persists changes to one or more existing schema fields.
   * Accepts a map of `{ schemaFieldId: updatedFieldData }` and mutates
   * each entry in parallel.
   */
  const updateSchemaData = (updatedSchemaDetails: Record<string, NewSchemaFieldInput>) => {
    Promise.all(
      Object.entries(updatedSchemaDetails).map(([schemaId, updatedSchema]) =>
        updateMutation.mutateAsync({ schemaId, updatedSchema })
          .catch((err) => { console.error(err); toast.error('Failed to update schema'); })
      )
    ).then(() => toast.success('Schema saved'));
  };

  /**
   * Creates one or more new schema fields. After all fields are created,
   * registers `schemaName` in the project metadata if it is not already there
   * (i.e. this is the first field being added to a brand-new schema).
   * No-ops on an empty list so saving with nothing new to add doesn't fire a
   * success toast.
   */
  const addSchemaData = (newSchemaDetails: NewSchemaFieldInput[]) => {
    if (newSchemaDetails.length === 0) return;
    Promise.all(
      newSchemaDetails.map((newSchema) =>
        createMutation.mutateAsync(newSchema)
          .catch((err) => { console.error(err); toast.error('Failed to add schema field'); })
      )
    ).then(() => {
      if (!schemaNames.includes(schemaName)) addNewSchemeName(schemaName);
      toast.success('Schema field added');
    });
  };

  /**
   * Deletes a single schema field by its ID. If the field being deleted is
   * the last one in the schema, also removes `schemaName` from the project
   * metadata so the schema no longer appears in listings.
   */
  const deleteSchemaData = (schemaId: string): Promise<boolean> =>
    deleteMutation.mutateAsync({ schemaId, schemaName })
      .then(() => {
        const remaining = schemaDetails[schemaName];
        if (remaining && remaining.length === 1) removeSchemaName(schemaName);
        toast.success('Schema field deleted');
        return true;
      })
      .catch((err) => { console.error(err); toast.error('Failed to delete schema field'); return false; });

  return {
    schemaNameData,
    schemaDetails,
    loading,
    updateSchemaData,
    addSchemaData,
    deleteSchemaData,
  };
};
