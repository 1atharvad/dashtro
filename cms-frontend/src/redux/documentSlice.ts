import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";

export const fetchCollection = createAsyncThunk("document/fetchCollection", async (
  {
    collectionName,
    workspaceName='production'
  }: {
    collectionName: string,
    workspaceName: string
  }
) => {
  const response = await fetch(`${API_BASE_URL}/workspace/${workspaceName}/collection/${collectionName}/`);
  return await response.json();
});

export const fetchDocument = createAsyncThunk("document/fetchDocument", async (
  {
    collectionName,
    documentId,
    workspaceName='production'
  }: {
    collectionName: string,
    documentId: string,
    workspaceName: string
  }
) => {
  const response = await fetch(`${API_BASE_URL}/workspace/${workspaceName}/collection/${collectionName}/document/${documentId}/`);
  return await response.json();
});

export const createDocument = createAsyncThunk("document/createDocument", async (
  {
    collectionName,
    workspaceName='production',
    newDocument
  }: {
    collectionName: string,
    workspaceName: string,
    newDocument: {[key: string]: any}
  }
) => {
  const response = await fetch(`${API_BASE_URL}/workspace/${workspaceName}/collection/${collectionName}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.entries(newDocument)
      .reduce((acc: {[key: string]: string}, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})),
  });
  return await response.json();
});

export const updateDocument = createAsyncThunk("document/updateDocument", async (
  {
    collectionName,
    documentId,
    workspaceName='production',
    updatedDocument
  }: {
    collectionName: string,
    documentId: string,
    workspaceName: string,
    updatedDocument: {[key: string]: any}
  }
) => {
  const response = await fetch(`${API_BASE_URL}/workspace/${workspaceName}/collection/${collectionName}/document/${documentId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedDocument),
  });
  return await response.json();
});

export const deleteDocument = createAsyncThunk("document/deleteDocument", async (
  {
    collectionName,
    documentId,
    workspaceName='production',
  }: {
    collectionName: string,
    documentId: string,
    workspaceName: string,
  }
) => {
  const response = await fetch(`${API_BASE_URL}/workspace/${workspaceName}/collection/${collectionName}/document/${documentId}/`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete");
  return {'_document_id': documentId};
});

const documentSlice = createSlice({
  name: "document",
  initialState: {
    documentData: {
      content: {} as {[key: string]: any},
      ids: {} as {[key: string]: any}
    },
    loading: true,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocument.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDocument.fulfilled, (state, action) => {
        const { collectionName, documentId } = action.meta.arg;
        const content = state.documentData['content'];

        if (!content[collectionName]) {
          content[collectionName] = {};
        }
        content[collectionName][documentId] =
          {
            ...content[collectionName][documentId],
            ...action.payload
          };
        state.loading = false;
      })
      .addCase(fetchDocument.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(fetchCollection.fulfilled, (state, action) => {
        const { collectionName } = action.meta.arg;

        state.documentData['ids'][collectionName] = action.payload
        state.loading = false;
      })
      .addCase(fetchCollection.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(updateDocument.fulfilled, (state, action) => {
        const { collectionName, documentId } = action.meta.arg;
        const content = state.documentData['content'];

        delete action.payload['_id'];
        content[collectionName][documentId] =
          {
            ...content[collectionName][documentId],
            ...action.payload
          };
        state.loading = false;
      })
      .addCase(createDocument.fulfilled, (state, action) => {
        const { collectionName } = action.meta.arg;
        const documentId = action.payload['_id'];
        const documentIds = state.documentData['ids'][collectionName]['_document_ids'];
        const content = state.documentData['content'];

        delete action.payload['_id'];

        if (!content[collectionName]) {
          content[collectionName] = {};
        }
        content[collectionName][documentId] =
          {
            ...content[collectionName][documentId],
            ...action.payload
          };
        action.payload['_id'] = documentId;
        
        state.documentData['ids'][collectionName]['_document_ids'] =
            [...documentIds, documentId];
        state.loading = false;
      })
      .addCase(deleteDocument.fulfilled, (state, action) => {
        const { collectionName } = action.meta.arg;
        const id = action.payload['_document_id'];
        const doc_ids = state.documentData['ids'][collectionName]['_document_ids'];

        state.documentData['ids'][collectionName]['_document_ids'] =
            doc_ids.filter((doc_id: string) => doc_id !== id);
      });
  },
});

export default documentSlice.reducer;
