import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";

export const fetchSchema = createAsyncThunk("schema/fetchSchemaMetaData", async () => {
  const response = await fetch(`${API_BASE_URL}/schema/`);
  console.log('fetch')
  return await response.json();
});

const schemaPresetSlice = createSlice({
  name: "schema_preset",
  initialState: {
    schemaData: {} as {[key: string]: any},
    loading: true,
    error: null as string | null,
  },
  reducers: {
    updateSchemaNames: (state, action) => {
      state.schemaData['_schema_names'] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSchema.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSchema.fulfilled, (state, action) => {
        state.loading = false;
        state.schemaData = action.payload;
      })
      .addCase(fetchSchema.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      });
  },
});

export const { updateSchemaNames } = schemaPresetSlice.actions;
export default schemaPresetSlice.reducer;
