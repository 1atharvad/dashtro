import type { Category } from '@ts/types/constants';
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useSetSchemaCategoryMutation,
} from '@ts/api/categories';

// Stable fallbacks: `data?.x ?? []` creates a new array/object on every
// render while data is still loading, which breaks referential equality for
// any effect depending on categories/categoryMap (infinite render loop).
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_CATEGORY_MAP: Record<string, string> = {};

export const useCategory = (projectId: string) => {
  const { data, isLoading: loading } = useCategoriesQuery(projectId);
  const createMutation = useCreateCategoryMutation(projectId);
  const updateMutation = useUpdateCategoryMutation(projectId);
  const deleteMutation = useDeleteCategoryMutation(projectId);
  const setSchemaCategoryMutation = useSetSchemaCategoryMutation(projectId);

  const categories: Category[] = data?.categories ?? EMPTY_CATEGORIES;
  const categoryMap: Record<string, string> = data?.category_map ?? EMPTY_CATEGORY_MAP;

  const addCategory = (name: string) => createMutation.mutateAsync(name);

  const updateCategory = (categoryId: string, name: string) =>
    updateMutation.mutateAsync({ categoryId, name });

  const removeCategory = (categoryId: string) => deleteMutation.mutateAsync(categoryId);

  const assignSchemaCategory = (schemaName: string, categoryId: string) =>
    setSchemaCategoryMutation.mutateAsync({ schemaName, categoryId });

  const getCategoryForSchema = (schemaName: string): string =>
    categoryMap[schemaName] ?? '';

  const getSchemasInCategory = (categoryId: string, schemaNames: string[]): string[] =>
    schemaNames.filter(name => (categoryMap[name] ?? '') === categoryId);

  const getGeneralSchemas = (schemaNames: string[]): string[] =>
    schemaNames.filter(name => !categoryMap[name]);

  return {
    categories,
    categoryMap,
    loading,
    addCategory,
    updateCategory,
    removeCategory,
    assignSchemaCategory,
    getCategoryForSchema,
    getSchemasInCategory,
    getGeneralSchemas,
  };
};
