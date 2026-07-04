import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type { Category } from '@ts/types/constants';

type CategoryState = {
  byProject: Record<string, { categories: Category[]; category_map: Record<string, string> }>;
  loading: boolean;
  error: string | null;
};

export const fetchCategories = createAsyncThunk("categories/fetch", async (projectId: string) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema-categories/`);
  if (!response.ok) throw new Error(`Failed to fetch categories: ${response.status}`);
  return { projectId, data: await response.json() };
});

export const createCategory = createAsyncThunk("categories/create", async (
  { projectId, name }: { projectId: string; name: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema-categories/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Failed to create category: ${response.status}`);
  return { projectId, category: await response.json() };
});

export const updateCategory = createAsyncThunk("categories/update", async (
  { projectId, categoryId, name }: { projectId: string; categoryId: string; name: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/schema-categories/${categoryId}/`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!response.ok) throw new Error(`Failed to update category: ${response.status}`);
  return { projectId, category: await response.json() };
});

export const deleteCategory = createAsyncThunk("categories/delete", async (
  { projectId, categoryId }: { projectId: string; categoryId: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/schema-categories/${categoryId}/`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Failed to delete category: ${response.status}`);
  return { projectId, categoryId };
});

export const setSchemaCategory = createAsyncThunk("categories/setSchemaCategory", async (
  { projectId, schemaName, categoryId }: { projectId: string; schemaName: string; categoryId: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/schema-category-map/${schemaName}/`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    }
  );
  if (!response.ok) throw new Error(`Failed to set schema category: ${response.status}`);
  return { projectId, schemaName, categoryId };
});

const categorySlice = createSlice({
  name: "categories",
  initialState: {
    byProject: {} as Record<string, { categories: Category[]; category_map: Record<string, string> }>,
    loading: false,
    error: null as string | null,
  } as CategoryState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => { state.loading = true; })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.data;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? null;
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        const { projectId, category } = action.payload;
        const project = state.byProject[projectId];
        if (!project) return;
        project.categories = project.categories.map(c =>
          c.id === category.id ? category : c
        );
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        const { projectId, category } = action.payload;
        const project = state.byProject[projectId] ?? { categories: [], category_map: {} };
        project.categories = [...project.categories, category];
        state.byProject[projectId] = project;
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        const { projectId, categoryId } = action.payload;
        const project = state.byProject[projectId];
        if (!project) return;
        project.categories = project.categories.filter(c => c.id !== categoryId);
        // remap schemas that were in this category back to General
        project.category_map = Object.fromEntries(
          Object.entries(project.category_map).map(([name, catId]) =>
            [name, catId === categoryId ? '' : catId]
          )
        );
      })
      .addCase(setSchemaCategory.fulfilled, (state, action) => {
        const { projectId, schemaName, categoryId } = action.payload;
        const project = state.byProject[projectId];
        if (!project) return;
        project.category_map = { ...project.category_map, [schemaName]: categoryId };
      });
  },
});

export default categorySlice.reducer;
