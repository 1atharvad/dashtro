import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";

export const fetchCollections = createAsyncThunk("schema/fetchCollection", async () => {
  const response = await fetch(`${API_BASE_URL}/collections/`);
  return await response.json();
});

export const createCollection = createAsyncThunk("schema/createCollection", async (
  newSchema: {[key: string]: any}
) => {
  const response = await fetch(`${API_BASE_URL}/collections/`, {
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

export const updateCollection = createAsyncThunk("schema/updateCollection", async (
  {
    collectionId,
    updatedCollection
  }: {
    collectionId: string,
    updatedCollection: {[key: string]: any}
  }
) => {
  const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedCollection),
  });
  return await response.json();
});

export const deleteCollection = createAsyncThunk("schema/deleteCollection", async (
  collectionId: string
) => {
  const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete");
  return {'_id': collectionId};
});

const collectionSlice = createSlice({
  name: "schema",
  initialState: {
    collectionData: {} as {[key: string]: any},
    loading: true,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollections.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCollections.fulfilled, (state, action) => {
        state.loading = false;
        state.collectionData = { ...state.collectionData, ...action.payload };
        state.collectionData['_schema_collections'] = state.collectionData['_schema_collections']
          .sort((a: {[key: string]: any}, b: {[key: string]: any}) => {
            const nameA = a['_collection_name']?.toLowerCase() || '';
            const nameB = b['_collection_name']?.toLowerCase() || '';
            return nameA.localeCompare(nameB);
          })
          .map((schemaEntry: {[key: string]: any}, index:  number) => {
            schemaEntry['_index'] = index + 1;
            return schemaEntry;
          });
      })
      .addCase(fetchCollections.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(updateCollection.fulfilled, (state, action) => {
        const id = action.payload['_id'];

        state.collectionData['_schema_collections'] = [...Array.from(state.collectionData['_schema_collections'])
          .filter((entry: any) => entry['_id'] !== id), action.payload]
          .sort((a, b) => a['_index'] - b['_index']);
        state.loading = false;
      })
      .addCase(createCollection.fulfilled, (state, action) => {
        state.collectionData['_schema_collections'] = (Object.values(action.payload) as [{[key: string]: any}])
          .sort((a: {[key: string]: any}, b: {[key: string]: any}) => {
            const nameA = a['_collection_name']?.toLowerCase() || '';
            const nameB = b['_collection_name']?.toLowerCase() || '';
            return nameA.localeCompare(nameB);
          })
          .map((schemaEntry: {[key: string]: any}, index:  number) => {
            schemaEntry['_index'] = index + 1;
            return schemaEntry;
          });
        state.loading = false;
      })
      .addCase(deleteCollection.fulfilled, (state, action) => {
        const id = action.payload['_id'];
        const index = state.collectionData['_schema_collections']
          .reduce((acc: number, schemaEntry: {[key: string]: any}) => 
              schemaEntry['_id'] === id ? schemaEntry['_index'] : acc, -1);

        state.collectionData['_schema_collections'] = state.collectionData['_schema_collections']
          .filter((schemaEntry: {[key: string]: any}) =>
              schemaEntry['_id'] !== id)
          .map((schemaEntry: {[key: string]: any}) => {
            console.log(id, schemaEntry['_index'], index)
            if (schemaEntry['_index'] > index) schemaEntry['_index'] -= 1;
            console.log(schemaEntry['_index'])
            return schemaEntry;
          });
      });
  },
});

export default collectionSlice.reducer;
