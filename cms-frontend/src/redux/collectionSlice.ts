import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";

export const fetchCollections = createAsyncThunk("collections/fetchCollections", async (
  projectId: string
) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/collections/`);
  if (!response.ok) throw new Error(`Failed to fetch collections: ${response.status}`);
  return { projectId, data: await response.json() };
});

export const createCollection = createAsyncThunk("collections/createCollection", async (
  { projectId, newCollection }: { projectId: string; newCollection: Record<string, any> }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/collections/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Object.entries(newCollection).reduce((acc: Record<string, string>, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})
    ),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.detail ?? "Failed to create collection");
  }
  return { projectId, data: await response.json() };
});

export const updateCollection = createAsyncThunk("collections/updateCollection", async (
  { projectId, collectionId, updatedCollection }: {
    projectId: string;
    collectionId: string;
    updatedCollection: Record<string, any>;
  }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/collections/${collectionId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedCollection),
  });
  return { projectId, data: await response.json() };
});

export const deleteCollection = createAsyncThunk("collections/deleteCollection", async (
  { projectId, collectionId }: { projectId: string; collectionId: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/collections/${collectionId}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete");
  return { projectId, _id: collectionId };
});

type CollectionState = {
  byProject: Record<string, { _schema_collections: any[]; _collection_schema_variables: any }>;
  loading: boolean;
  error: string | null;
};

const collectionSlice = createSlice({
  name: "collections",
  initialState: {
    byProject: {},
    loading: true,
    error: null as string | null,
  } as CollectionState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollections.pending, (state) => { state.loading = true; })
      .addCase(fetchCollections.fulfilled, (state, action) => {
        state.loading = false;
        const { projectId, data } = action.payload;
        state.byProject[projectId] = data;
      })
      .addCase(fetchCollections.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(createCollection.fulfilled, (state, action) => {
        const { projectId, data } = action.payload;
        state.byProject[projectId] = data;
        state.loading = false;
      })
      .addCase(createCollection.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to create collection";
      })
      .addCase(updateCollection.fulfilled, (state, action) => {
        const { projectId, data } = action.payload;
        const existing = state.byProject[projectId];
        if (!existing) return;
        existing._schema_collections = [
          ...existing._schema_collections.filter((c: any) => c._id !== data._id),
          data,
        ].sort((a, b) => a._index - b._index);
        state.loading = false;
      })
      .addCase(deleteCollection.fulfilled, (state, action) => {
        const { projectId, _id: id } = action.payload;
        const existing = state.byProject[projectId];
        if (!existing) return;
        const index = existing._schema_collections
          .find((c: any) => c._id === id)?._index ?? -1;
        existing._schema_collections = existing._schema_collections
          .filter((c: any) => c._id !== id)
          .map((c: any) => ({ ...c, _index: c._index > index ? c._index - 1 : c._index }));
      });
  },
});

export default collectionSlice.reducer;
