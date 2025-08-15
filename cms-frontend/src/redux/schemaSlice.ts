import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";

export const fetchSchema = createAsyncThunk("schema/fetchSchema", async (
  schemaName: string
) => {
  const response = await fetch(`${API_BASE_URL}/schema/${schemaName}/`);
  return await response.json();
});

export const createSchema = createAsyncThunk("schema/createSchema", async (
  newSchema: {[key: string]: any}
) => {
  const response = await fetch(`${API_BASE_URL}/schema/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.entries(newSchema)
      .reduce((acc: {[key: string]: string}, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})),
  });
  return await response.json();
});

export const updateSchema = createAsyncThunk("schema/updateSchema", async (
  {
    schemaId,
    updatedSchema
  }: {
    schemaId: string,
    updatedSchema: {[key: string]: any}
  }
) => {
  const response = await fetch(`${API_BASE_URL}/schema/${schemaId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedSchema),
  });
  return await response.json();
});

export const deleteSchema = createAsyncThunk("schema/deleteSchema", async (
  {
    schemaId,
    schemaName
  }: {
    schemaId: string,
    schemaName: string
  }
) => {
  const response = await fetch(`${API_BASE_URL}/schema/${schemaId}/`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete");
  return {'_id': schemaId, '_schema_name': schemaName};
});

const schemaSlice = createSlice({
  name: "schema",
  initialState: {
    schemaData: {} as {[key: string]: any},
    loading: true,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSchema.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSchema.fulfilled, (state, action) => {
        state.loading = false;
        state.schemaData = { ...state.schemaData, ...action.payload };
      })
      .addCase(fetchSchema.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(updateSchema.fulfilled, (state, action) => {
        const id = action.payload['_id'];
        const schemaName = action.payload['_schema_name'];

        delete action.payload['_schema_name'];
        state.schemaData[schemaName] = [...Array.from(state.schemaData[schemaName])
          .filter((entry: any) => entry['_id'] !== id), action.payload]
          .sort((a, b) => a['_index'] - b['_index']);
        state.loading = false;
      })
      .addCase(createSchema.fulfilled, (state, action) => {
        const schemaName = action.payload['_schema_name'];

        delete action.payload['_schema_name'];
        state.schemaData[schemaName] = schemaName in state.schemaData
          ? [...state.schemaData[schemaName], action.payload]
          : [action.payload];
      })
      .addCase(deleteSchema.fulfilled, (state, action) => {
        const id = action.payload['_id'];
        const schemaName = action.payload['_schema_name'];
        const index = state.schemaData[schemaName]
          .reduce((acc: number, schemaEntry: {[key: string]: any}) => 
              schemaEntry['_id'] === id ? schemaEntry['_index'] : acc, -1);

        if (index >= 0) {
          state.schemaData[schemaName] = state.schemaData[schemaName]
            .filter((schemaEntry: {[key: string]: any}) =>
                schemaEntry['_id'] !== id)
            .map((schemaEntry: {[key: string]: any}) => {
              if (schemaEntry['_index'] > index) schemaEntry['_index'] -= 1;
              return schemaEntry;
            });
        }
      });
  },
});

export default schemaSlice.reducer;
