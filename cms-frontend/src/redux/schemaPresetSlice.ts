import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type { SchemaListResponse } from '@ts/types/constants';

export const fetchSchema = createAsyncThunk("schema/fetchSchemaMetaData", async (
  projectId: string
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema/`);
  if (!response.ok) throw new Error(`Failed to fetch schema: ${response.status}`);
  return { projectId, data: await response.json() as SchemaListResponse };
});

const schemaPresetSlice = createSlice({
  name: "schema_preset",
  initialState: {
    byProject: {} as Record<string, SchemaListResponse>,
    loading: false,
    error: null as string | null,
  },
  reducers: {
    updateSchemaNames: (state, action: { payload: { projectId: string; names: string[] } }) => {
      if (state.byProject[action.payload.projectId]) {
        state.byProject[action.payload.projectId]._schema_names = action.payload.names;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSchema.pending, (state) => { state.loading = true; })
      .addCase(fetchSchema.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.data;
      })
      .addCase(fetchSchema.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      });
  },
});

export const { updateSchemaNames } = schemaPresetSlice.actions;
export default schemaPresetSlice.reducer;
