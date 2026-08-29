import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type { RichTextComponent } from '@ts/types/constants';

export const richTextComponentKeys = {
  byProject: (projectId: string) => ['richTextComponents', projectId] as const,
};

export function useRichTextComponentsQuery(projectId: string) {
  return useQuery({
    queryKey: richTextComponentKeys.byProject(projectId),
    queryFn: () => apiRequest<RichTextComponent[]>(`/projects/${projectId}/rich-text-components/`),
    enabled: !!projectId,
  });
}

export function useCreateRichTextComponentMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; source: string; css?: string; sampleHtml?: string }) =>
      apiRequest<RichTextComponent>(`/projects/${projectId}/rich-text-components/`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          source: input.source,
          css: input.css ?? '',
          sampleHtml: input.sampleHtml ?? '',
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: richTextComponentKeys.byProject(projectId) }),
  });
}

export function useUpdateRichTextComponentMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { componentId: string; name: string; source: string; css: string; sampleHtml: string }) =>
      apiRequest<RichTextComponent>(`/projects/${projectId}/rich-text-components/${input.componentId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          name: input.name,
          source: input.source,
          css: input.css,
          sampleHtml: input.sampleHtml,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: richTextComponentKeys.byProject(projectId) }),
  });
}

export function useDeleteRichTextComponentMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (componentId: string) =>
      apiRequest<void>(`/projects/${projectId}/rich-text-components/${componentId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: richTextComponentKeys.byProject(projectId) }),
  });
}
