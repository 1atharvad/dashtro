import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type { SchemaListResponse } from '@ts/types/constants';

export const schemaPresetKeys = {
  byProject: (projectId: string) => ['schemaPreset', projectId] as const,
};

export const useSchemaPresetQuery = (projectId: string) => {
  return useQuery({
    queryKey: schemaPresetKeys.byProject(projectId),
    queryFn: () => apiRequest<SchemaListResponse>(`/projects/${projectId}/schema/`),
    enabled: !!projectId,
  });
};

/**
 * addNewSchemeName/removeSchemaName are local cache patches, not server
 * calls — they keep the cached schema-name list in sync immediately after
 * some other mutation (elsewhere) creates/deletes a schema field, without
 * waiting on a refetch.
 */
export const useSchemaPresetCache = (projectId: string) => {
  const queryClient = useQueryClient();
  const key = schemaPresetKeys.byProject(projectId);

  const setSchemaNames = (names: string[]) => {
    queryClient.setQueryData<SchemaListResponse>(key, (prev) =>
      prev ? { ...prev, _schema_names: names } : prev
    );
  };

  return { setSchemaNames };
};
