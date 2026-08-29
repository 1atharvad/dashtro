import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';

export type Project = { _id: string; name: string; description: string; created_at: string; updated_at: string };

export const projectKeys = { all: ['projects'] as const };

export const useProjectsQuery = () => {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiRequest<Project[]>('/projects/'),
  });
};

export const useCreateProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiRequest<Project>('/projects/', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
};

export const useUpdateProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: { name: string; description?: string } }) =>
      apiRequest<Project>(`/projects/${projectId}/`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
};

export const useDeleteProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest<void>(`/projects/${projectId}/`, { method: 'DELETE', parseJson: false });
      return { _id: projectId };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
};

export const useDuplicateProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiRequest<Project>(`/projects/${projectId}/duplicate/`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
};
