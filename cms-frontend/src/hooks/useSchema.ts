import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createSchema, fetchSchema, updateSchema, deleteSchema } from '@/redux/schemaSlice';
import type { RootState, AppDispatch, SchemaFieldItem, NewSchemaFieldInput } from '@ts/types/constants';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { toast } from 'advi-ui';

/**
 * Manages schema data for a single schema within a project.
 *
 * Responsibilities:
 * - Fetches the root schema and any schemas directly referenced as nested
 *   document fields (one level deep only).
 * - Resets all local state when `schemaName` changes so stale data from a
 *   previous schema never bleeds into the new one.
 * - Exposes CRUD helpers that dispatch Redux actions and show toast feedback.
 *
 * @param projectId - The project to load schema data for.
 * @param schemaName - The specific schema to load (e.g. "Article", "Author").
 */
export const useSchemaData = (projectId: string, schemaName: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading, error } = useSelector((state: RootState) => state.schema);

  const projectSchemaData = useMemo(() => byProject[projectId] ?? {}, [byProject, projectId]);

  const { schemaNames, addNewSchemeName, removeSchemaName } = useSchemaMetaData(projectId);
  const [schemaNameData, setSchemaNameData] = useState<SchemaFieldItem[]>([]);
  const [schemaDetails, setSchemaDetails] = useState<Record<string, SchemaFieldItem[]>>({});

  const _loading = loading || !(schemaName in projectSchemaData);

  const requestedRef = useRef(new Set<string>());
  const schemaNamesRef = useRef(schemaNames);
  schemaNamesRef.current = schemaNames;

  /**
   * Dispatches a fetch for `name` if it has not already been requested in
   * the current schema session. Uses a ref-backed Set so multiple calls with
   * the same name are no-ops without causing re-renders.
   */
  const requestSchema = (name: string, requireInList = true) => {
    if (!name || requestedRef.current.has(name)) return;
    if (requireInList && !schemaNamesRef.current.includes(name)) return;
    requestedRef.current.add(name);
    dispatch(fetchSchema({ projectId, schemaName: name }));
  };

  /**
   * Runs when the user navigates to a different schema.
   * Clears the requested-set, schemaDetails, and schemaNameData so data
   * from the previous schema cannot appear while the new one is loading.
   */
  useEffect(() => {
    requestedRef.current = new Set();
    setSchemaDetails({});
    setSchemaNameData([]);
  }, [schemaName]);

  /**
   * Kicks off the initial fetch for the root schema.
   * Also re-runs when schemaNames becomes available so the fetch is retried
   * if project metadata was not ready on the first render.
   */
  useEffect(() => {
    // Don't wait for schemaNames to load before fetching the root schema —
    // the caller always knows the schema exists (it came from a collection or URL).
    requestSchema(schemaName, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaName, schemaNames]);

  /**
   * Watches Redux state for newly arrived schema payloads.
   * Whenever loading finishes, compares requestedRef against projectSchemaData
   * and merges any newly available schemas into schemaDetails.
   * Uses functional setState to avoid reading stale state from the closure.
   */
  useEffect(() => {
    if (loading || error) return;

    setSchemaDetails(prev => {
      const newEntries = [...requestedRef.current].filter(
        name => name in projectSchemaData && !(name in prev)
      );
      if (newEntries.length === 0) return prev;

      const updated = { ...prev };
      newEntries.forEach(name => {
        updated[name] = projectSchemaData[name];
      });
      return updated;
    });
  }, [loading, projectSchemaData, error]);

  /**
   * Runs after schemaDetails updates to discover and request nested schemas
   * at all depths. Walks every schema currently in schemaDetails and requests
   * any _nested_schema references not yet fetched. This ensures DocumentEntry
   * can render deeply nested document fields (e.g. A → B → C).
   * Self-references (a schema referencing itself) are blocked by requestedRef
   * since the root schema is always added first.
   * Also syncs schemaNameData with the latest root schema field list so the
   * UI always reflects the most recent Redux state.
   */
  useEffect(() => {
    Object.values(schemaDetails).forEach((schemaInfo) => {
      schemaInfo?.forEach((variable) => {
        const nested = variable._nested_schema;
        if (nested && nested !== schemaName) requestSchema(nested);
      });
    });
    const rootFields = schemaDetails[schemaName];
    if (rootFields) setSchemaNameData(rootFields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaDetails, schemaName]);

  /**
   * Persists changes to one or more existing schema fields.
   * Accepts a map of `{ schemaFieldId: updatedFieldData }` and dispatches
   * an update action for each entry in parallel.
   */
  const updateSchemaData = (updatedSchemaDetails: Record<string, NewSchemaFieldInput>) => {
    Promise.all(
      Object.entries(updatedSchemaDetails).map(([schemaId, updatedSchema]) =>
        dispatch(updateSchema({ projectId, schemaId, updatedSchema }))
          .catch(err => { console.error(err); toast.error('Failed to update schema'); })
      )
    ).then(() => toast.success('Schema saved'));
  };

  /**
   * Creates one or more new schema fields. After all fields are created,
   * registers `schemaName` in the project metadata if it is not already there
   * (i.e. this is the first field being added to a brand-new schema).
   */
  const addSchemaData = (newSchemaDetails: NewSchemaFieldInput[]) => {
    Promise.all(
      newSchemaDetails.map(newSchema =>
        dispatch(createSchema({ projectId, newSchema }))
          .catch(err => { console.error(err); toast.error('Failed to add schema field'); })
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
  const deleteSchemaData = (schemaId: string) => {
    dispatch(deleteSchema({ projectId, schemaId, schemaName }))
      .then(() => {
        const remaining = projectSchemaData[schemaName];
        if (remaining && remaining.length === 1) removeSchemaName(schemaName);
        toast.success('Schema field deleted');
      })
      .catch(err => { console.error(err); toast.error('Failed to delete schema field'); });
  };

  return {
    schemaNameData,
    schemaDetails,
    loading: _loading,
    updateSchemaData,
    addSchemaData,
    deleteSchemaData,
  };
};
