import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type { Category } from '@ts/types/constants';

export type ProjectCategories = { categories: Category[]; category_map: Record<string, string> };

export const categoryKeys = {
  byProject: (projectId: string) => ['categories', projectId] as const,
};

export const useCategoriesQuery = (projectId: string) => {
  return useQuery({
    queryKey: categoryKeys.byProject(projectId),
    queryFn: () => apiRequest<ProjectCategories>(`/projects/${projectId}/schema-categories/`),
    enabled: !!projectId,
  });
};

export const useCreateCategoryMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<Category>(`/projects/${projectId}/schema-categories/`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.byProject(projectId) }),
  });
};

export const useUpdateCategoryMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      apiRequest<Category>(`/projects/${projectId}/schema-categories/${categoryId}/`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.byProject(projectId) }),
  });
};

export const useDeleteCategoryMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest<void>(`/projects/${projectId}/schema-categories/${categoryId}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.byProject(projectId) }),
  });
};

export const useSetSchemaCategoryMutation = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ schemaName, categoryId }: { schemaName: string; categoryId: string }) =>
      apiRequest<void>(`/projects/${projectId}/schema-category-map/${schemaName}/`, {
        method: 'PUT',
        body: JSON.stringify({ category_id: categoryId }),
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.byProject(projectId) }),
  });
};
