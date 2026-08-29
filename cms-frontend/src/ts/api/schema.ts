import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type { SchemaFieldItem, NewSchemaFieldInput } from '@ts/types/constants';

export const schemaKeys = {
  detail: (projectId: string, schemaName: string) => ['schema', projectId, schemaName] as const,
};

export function useSchemaQuery(projectId: string, schemaName: string, enabled: boolean) {
  return useQuery({
    queryKey: schemaKeys.detail(projectId, schemaName),
    queryFn: () =>
      apiRequest<Record<string, SchemaFieldItem[]>>(`/projects/${projectId}/schema/${schemaName}/`)
        .then(data => data[schemaName] ?? []),
    enabled: enabled && !!projectId && !!schemaName,
  });
}

const stripEmpty = (input: NewSchemaFieldInput): Record<string, unknown> =>
  Object.entries(input).reduce((acc: Record<string, unknown>, [key, value]) => {
    if (value !== '') acc[key] = value;
    return acc;
  }, {});

export function useCreateSchemaFieldMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newSchema: NewSchemaFieldInput) =>
      apiRequest<SchemaFieldItem>(`/projects/${projectId}/schema/`, {
        method: 'POST',
        body: JSON.stringify(stripEmpty(newSchema)),
      }),
    onSuccess: (data) => {
      const schemaName = data._schema_name ?? '';
      const entry = { ...data };
      delete entry._schema_name;
      queryClient.setQueryData(
        schemaKeys.detail(projectId, schemaName),
        (prev: SchemaFieldItem[] | undefined) => [...(prev ?? []), entry]
      );
    },
  });
}

export function useUpdateSchemaFieldMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ schemaId, updatedSchema }: { schemaId: string; updatedSchema: NewSchemaFieldInput }) =>
      apiRequest<SchemaFieldItem>(`/projects/${projectId}/schema/${schemaId}/`, {
        method: 'PUT',
        body: JSON.stringify(updatedSchema),
      }),
    onSuccess: (data) => {
      const id = data._id;
      const schemaName = data._schema_name ?? '';
      const entry = { ...data };
      delete entry._schema_name;
      queryClient.setQueryData(
        schemaKeys.detail(projectId, schemaName),
        (prev: SchemaFieldItem[] | undefined) =>
          [...(prev ?? []).filter((e) => e._id !== id), entry].sort((a, b) => a._index - b._index)
      );
    },
  });
}

export function useDeleteSchemaFieldMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ schemaId }: { schemaId: string; schemaName: string }) =>
      apiRequest<void>(`/projects/${projectId}/schema/${schemaId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: (_data, { schemaId, schemaName }) => {
      queryClient.setQueryData(
        schemaKeys.detail(projectId, schemaName),
        (prev: SchemaFieldItem[] | undefined) => {
          const entries = prev ?? [];
          const index = entries.reduce((acc: number, e) => (e._id === schemaId ? e._index : acc), -1);
          if (index < 0) return entries;
          return entries
            .filter((e) => e._id !== schemaId)
            .map((e) => ({ ...e, _index: e._index > index ? e._index - 1 : e._index }));
        }
      );
    },
  });
}
