import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch, Category } from '@ts/types/constants';
import {
  fetchCategories,
  createCategory as createCategoryAction,
  updateCategory as updateCategoryAction,
  deleteCategory as deleteCategoryAction,
  setSchemaCategory as setSchemaCategoryAction,
} from '@/redux/categorySlice';

export const useCategory = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading } = useSelector((state: RootState) => state.categories);
  const projectData = byProject[projectId];

  useEffect(() => {
    if (projectId && !projectData) {
      dispatch(fetchCategories(projectId));
    }
  }, [dispatch, projectId, projectData]);

  const categories: Category[] = projectData?.categories ?? [];
  const categoryMap: Record<string, string> = projectData?.category_map ?? {};

  const addCategory = (name: string) =>
    dispatch(createCategoryAction({ projectId, name }));

  const updateCategory = (categoryId: string, name: string) =>
    dispatch(updateCategoryAction({ projectId, categoryId, name }));

  const removeCategory = (categoryId: string) =>
    dispatch(deleteCategoryAction({ projectId, categoryId }));

  const assignSchemaCategory = (schemaName: string, categoryId: string) =>
    dispatch(setSchemaCategoryAction({ projectId, schemaName, categoryId }));

  const getCategoryForSchema = (schemaName: string): string =>
    categoryMap[schemaName] ?? '';

  const getSchemasInCategory = (categoryId: string, schemaNames: string[]): string[] =>
    schemaNames.filter(name => (categoryMap[name] ?? '') === categoryId);

  const getGeneralSchemas = (schemaNames: string[]): string[] =>
    schemaNames.filter(name => !categoryMap[name]);

  return {
    categories,
    categoryMap,
    loading: loading && !projectData,
    addCategory,
    updateCategory,
    removeCategory,
    assignSchemaCategory,
    getCategoryForSchema,
    getSchemasInCategory,
    getGeneralSchemas,
  };
};
