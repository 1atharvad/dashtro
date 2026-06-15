import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";

export const fetchSchema = createAsyncThunk("schema/fetchSchema", async (
  { projectId, schemaName }: { projectId: string; schemaName: string }
) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/schema/${schemaName}/`);
  if (!response.ok) throw new Error(`Failed to fetch schema: ${response.status}`);
  return { projectId, data: await response.json() };
});

export const createSchema = createAsyncThunk("schema/createSchema", async (
  { projectId, newSchema }: { projectId: string; newSchema: Record<string, any> }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Object.entries(newSchema).reduce((acc: Record<string, string>, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})
    ),
  });
  if (!response.ok) throw new Error(`Failed to create schema: ${response.status}`);
  return { projectId, data: await response.json() };
});

export const updateSchema = createAsyncThunk("schema/updateSchema", async (
  { projectId, schemaId, updatedSchema }: { projectId: string; schemaId: string; updatedSchema: Record<string, any> }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema/${schemaId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedSchema),
  });
  if (!response.ok) throw new Error(`Failed to update schema: ${response.status}`);
  return { projectId, data: await response.json() };
});

export const deleteSchema = createAsyncThunk("schema/deleteSchema", async (
  { projectId, schemaId, schemaName }: { projectId: string; schemaId: string; schemaName: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/schema/${schemaId}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete");
  return { projectId, _id: schemaId, _schema_name: schemaName };
});

type SchemaState = {
  byProject: Record<string, Record<string, any>>;
  loading: boolean;
  error: string | null;
};

const schemaSlice = createSlice({
  name: "schema",
  initialState: {
    byProject: {} as Record<string, Record<string, any>>,
    loading: true,
    error: null as string | null,
  } as SchemaState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSchema.pending, (state) => { state.loading = true; })
      .addCase(fetchSchema.fulfilled, (state, action) => {
        state.loading = false;
        const { projectId, data } = action.payload;
        state.byProject[projectId] = { ...(state.byProject[projectId] ?? {}), ...data };
      })
      .addCase(fetchSchema.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(updateSchema.fulfilled, (state, action) => {
        const { projectId, data } = action.payload;
        const id = data['_id'];
        const schemaName = data['_schema_name'];
        const project = state.byProject[projectId] ?? {};
        delete data['_schema_name'];
        project[schemaName] = [...(project[schemaName] ?? []).filter((e: any) => e['_id'] !== id), data]
          .sort((a, b) => a['_index'] - b['_index']);
        state.byProject[projectId] = project;
        state.loading = false;
      })
      .addCase(createSchema.fulfilled, (state, action) => {
        const { projectId, data } = action.payload;
        const schemaName = data['_schema_name'];
        const project = state.byProject[projectId] ?? {};
        delete data['_schema_name'];
        project[schemaName] = schemaName in project
          ? [...project[schemaName], data]
          : [data];
        state.byProject[projectId] = project;
      })
      .addCase(deleteSchema.fulfilled, (state, action) => {
        const { projectId, _id: id, _schema_name: schemaName } = action.payload;
        const project = state.byProject[projectId] ?? {};
        const entries = project[schemaName] ?? [];
        const index = entries.reduce((acc: number, e: any) => e['_id'] === id ? e['_index'] : acc, -1);
        if (index >= 0) {
          project[schemaName] = entries
            .filter((e: any) => e['_id'] !== id)
            .map((e: any) => ({ ...e, _index: e['_index'] > index ? e['_index'] - 1 : e['_index'] }));
        }
        state.byProject[projectId] = project;
      });
  },
});

export default schemaSlice.reducer;
