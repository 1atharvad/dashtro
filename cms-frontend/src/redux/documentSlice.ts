import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";

const base = (projectId: string, workspaceName: string, collectionName: string) =>
  `${API_BASE_URL}/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}`;

export const fetchCollection = createAsyncThunk("document/fetchCollection", async (
  { projectId, collectionName, workspaceName }: {
    projectId: string; collectionName: string; workspaceName: string;
  }
) => {
  const response = await fetch(`${base(projectId, workspaceName, collectionName)}/`);
  if (!response.ok) throw new Error(`Failed to fetch collection: ${response.status}`);
  return { projectId, collectionName, data: await response.json() };
});

export const fetchDocument = createAsyncThunk("document/fetchDocument", async (
  { projectId, collectionName, documentId, workspaceName }: {
    projectId: string; collectionName: string; documentId: string; workspaceName: string;
  }
) => {
  const response = await fetch(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/?raw=true`);
  if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
  return { projectId, collectionName, documentId, data: await response.json() };
});

export const createDocument = createAsyncThunk("document/createDocument", async (
  { projectId, collectionName, workspaceName, newDocument }: {
    projectId: string; collectionName: string; workspaceName: string; newDocument: Record<string, any>;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Object.entries(newDocument).reduce((acc: Record<string, any>, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})
    ),
  });
  return { projectId, collectionName, data: await response.json() };
});

export const updateDocument = createAsyncThunk("document/updateDocument", async (
  { projectId, collectionName, documentId, workspaceName, updatedDocument }: {
    projectId: string; collectionName: string; documentId: string;
    workspaceName: string; updatedDocument: Record<string, any>;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedDocument),
  });
  return { projectId, collectionName, documentId, data: await response.json() };
});

export const updateDocumentStatus = createAsyncThunk("document/updateDocumentStatus", async (
  { projectId, collectionName, documentId, workspaceName, status }: {
    projectId: string; collectionName: string; documentId: string;
    workspaceName: string; status: 'draft' | 'published';
  }
) => {
  const response = await authFetch(
    `${base(projectId, workspaceName, collectionName)}/document/${documentId}/status/`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _status: status }),
    }
  );
  if (!response.ok) throw new Error("Failed to update status");
  return { projectId, collectionName, documentId, status, data: await response.json() };
});

export const deleteDocument = createAsyncThunk("document/deleteDocument", async (
  { projectId, collectionName, documentId, workspaceName }: {
    projectId: string; collectionName: string; documentId: string; workspaceName: string;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete");
  return { projectId, collectionName, documentId };
});

export const fetchDocumentVersions = createAsyncThunk("document/fetchDocumentVersions", async (
  { projectId, collectionName, documentId, workspaceName }: {
    projectId: string; collectionName: string; documentId: string; workspaceName: string;
  }
) => {
  const response = await authFetch(
    `${base(projectId, workspaceName, collectionName)}/document/${documentId}/versions/`
  );
  if (!response.ok) throw new Error("Failed to fetch versions");
  return { documentId, versions: await response.json() };
});

export const restoreDocumentVersion = createAsyncThunk("document/restoreDocumentVersion", async (
  { projectId, collectionName, documentId, workspaceName, versionId }: {
    projectId: string; collectionName: string; documentId: string;
    workspaceName: string; versionId: string;
  }
) => {
  const response = await authFetch(
    `${base(projectId, workspaceName, collectionName)}/document/${documentId}/versions/${versionId}/restore/`,
    { method: "POST" }
  );
  if (!response.ok) throw new Error("Failed to restore version");
  return { projectId, collectionName, documentId, data: await response.json() };
});

export type DocumentVersion = {
  id: string;
  version_number: number;
  created_at: string;
  created_by_id: string;
  created_by_email: string;
};

type DocumentState = {
  byProject: Record<string, {
    content: Record<string, Record<string, any>>;
    ids: Record<string, any>;
  }>;
  versions: Record<string, DocumentVersion[]>;
  loading: boolean;
  error: string | null;
};

const empty = () => ({ content: {}, ids: {} });

const documentSlice = createSlice({
  name: "document",
  initialState: {
    byProject: {},
    versions: {},
    loading: true,
    error: null as string | null,
  } as DocumentState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocument.pending, (state) => { state.loading = true; })
      .addCase(fetchDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        if (!proj.content[collectionName]) proj.content[collectionName] = {};
        proj.content[collectionName][documentId] = {
          ...(proj.content[collectionName][documentId] ?? {}),
          ...data,
        };
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(fetchDocument.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(fetchCollection.fulfilled, (state, action) => {
        const { projectId, collectionName, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        proj.ids[collectionName] = data;
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(fetchCollection.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(updateDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        delete data['_id'];
        proj.content[collectionName][documentId] = {
          ...(proj.content[collectionName][documentId] ?? {}),
          ...data,
        };
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(updateDocumentStatus.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId, status, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        if (proj.content[collectionName]?.[documentId]) {
          proj.content[collectionName][documentId]._status = status;
        }
        if (proj.ids[collectionName]?._document_statuses) {
          proj.ids[collectionName]._document_statuses[documentId] = status;
        }
        // also sync full data if available
        if (data && proj.content[collectionName]) {
          const entry = { ...data };
          delete entry['_id'];
          proj.content[collectionName][documentId] = {
            ...(proj.content[collectionName][documentId] ?? {}),
            ...entry,
          };
        }
        state.byProject[projectId] = proj;
      })
      .addCase(createDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, data } = action.payload;
        const documentId = data['_id'];
        const proj = state.byProject[projectId] ?? empty();
        if (!proj.content[collectionName]) proj.content[collectionName] = {};
        const entry = { ...data };
        delete entry['_id'];
        proj.content[collectionName][documentId] = entry;
        data['_id'] = documentId;
        proj.ids[collectionName] = {
          ...(proj.ids[collectionName] ?? {}),
          _document_ids: [...(proj.ids[collectionName]?.['_document_ids'] ?? []), documentId],
          _document_statuses: {
            ...(proj.ids[collectionName]?._document_statuses ?? {}),
            [documentId]: data['_status'] ?? 'draft',
          },
        };
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(deleteDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId } = action.payload;
        const proj = state.byProject[projectId];
        if (!proj) return;
        proj.ids[collectionName]['_document_ids'] = (proj.ids[collectionName]['_document_ids'] ?? [])
          .filter((id: string) => id !== documentId);
        if (proj.ids[collectionName]._document_statuses) {
          delete proj.ids[collectionName]._document_statuses[documentId];
        }
      })
      .addCase(fetchDocumentVersions.fulfilled, (state, action) => {
        const { documentId, versions } = action.payload;
        state.versions[documentId] = versions;
      })
      .addCase(restoreDocumentVersion.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        if (proj.content[collectionName]) {
          const entry = { ...data };
          delete entry['_id'];
          proj.content[collectionName][documentId] = entry;
        }
        state.byProject[projectId] = proj;
      });
  },
});

export default documentSlice.reducer;
