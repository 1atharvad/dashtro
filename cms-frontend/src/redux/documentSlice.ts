import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type {
  DocumentData, NewDocumentInput, CollectionMeta, DocumentVersion,
} from "@ts/types/constants";

const base = (projectId: string, workspaceName: string, collectionName: string) =>
  `${API_BASE_URL}/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}`;

export const fetchCollection = createAsyncThunk("document/fetchCollection", async (
  { projectId, collectionName, workspaceName }: {
    projectId: string; collectionName: string; workspaceName: string;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/`);
  if (!response.ok) throw new Error(`Failed to fetch collection: ${response.status}`);
  return { projectId, collectionName, data: await response.json() as CollectionMeta };
});

export const fetchDocument = createAsyncThunk("document/fetchDocument", async (
  { projectId, collectionName, documentId, workspaceName }: {
    projectId: string; collectionName: string; documentId: string; workspaceName: string;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/?depth=1`);
  if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
  return { projectId, collectionName, documentId, data: await response.json() as DocumentData };
});

export const createDocument = createAsyncThunk("document/createDocument", async (
  { projectId, collectionName, workspaceName, newDocument }: {
    projectId: string; collectionName: string; workspaceName: string; newDocument: NewDocumentInput;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Object.entries(newDocument).reduce((acc: Record<string, unknown>, [key, value]) => {
        if (value !== '') acc[key] = value;
        return acc;
      }, {})
    ),
  });
  return { projectId, collectionName, data: await response.json() as DocumentData };
});

export const updateDocument = createAsyncThunk("document/updateDocument", async (
  { projectId, collectionName, documentId, workspaceName, updatedDocument }: {
    projectId: string; collectionName: string; documentId: string;
    workspaceName: string; updatedDocument: NewDocumentInput;
  }
) => {
  const response = await authFetch(`${base(projectId, workspaceName, collectionName)}/document/${documentId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedDocument),
  });
  return { projectId, collectionName, documentId, data: await response.json() as DocumentData };
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
  return { documentId, versions: await response.json() as DocumentVersion[] };
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
  return { projectId, collectionName, documentId, data: await response.json() as DocumentData };
});

const syncToProd = async (url: string, errorMessage: string, resolutions?: Record<string, "production" | "workspace">) => {
  const response = await authFetch(url, resolutions ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolutions }),
  } : { method: "POST" });
  if (!response.ok) throw new Error(errorMessage);
  return await response.json();
};

export const pushCollectionToProd = createAsyncThunk("document/pushCollectionToProd", async (
  { projectId, collectionName, workspaceName }: {
    projectId: string; collectionName: string; workspaceName: string;
  }
) => syncToProd(
  `${base(projectId, workspaceName, collectionName)}/push-to-prod/`,
  "Failed to push collection to production",
));

export const pullCollectionFromProd = createAsyncThunk("document/pullCollectionFromProd", async (
  { projectId, collectionName, workspaceName, resolutions }: {
    projectId: string; collectionName: string; workspaceName: string;
    resolutions: Record<string, "production" | "workspace">;
  }
) => syncToProd(
  `${base(projectId, workspaceName, collectionName)}/pull-from-production/`,
  "Failed to pull collection from production",
  resolutions,
));

export const pushDocumentToProd = createAsyncThunk("document/pushDocumentToProd", async (
  { projectId, collectionName, workspaceName, documentId }: {
    projectId: string; collectionName: string; workspaceName: string; documentId: string;
  }
) => syncToProd(
  `${base(projectId, workspaceName, collectionName)}/document/${documentId}/push-to-prod/`,
  "Failed to push document to production",
));

export const pullDocumentFromProd = createAsyncThunk("document/pullDocumentFromProd", async (
  { projectId, collectionName, workspaceName, documentId }: {
    projectId: string; collectionName: string; workspaceName: string; documentId: string;
  }
) => {
  const data = await syncToProd(
    `${base(projectId, workspaceName, collectionName)}/document/${documentId}/pull-from-production/`,
    "Failed to pull document from production",
  ) as DocumentData;
  return { projectId, collectionName, documentId, data };
});

export type { DocumentVersion };

type DocumentState = {
  byProject: Record<string, {
    content: Record<string, Record<string, DocumentData>>;
    ids: Record<string, CollectionMeta>;
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
      .addCase(fetchDocument.pending, (state) => { state.loading = true; state.error = null; })
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
      .addCase(fetchCollection.pending, (state) => { state.loading = true; state.error = null; })
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
        delete data._id;
        proj.content[collectionName][documentId] = {
          ...(proj.content[collectionName][documentId] ?? {}),
          ...data,
        };
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(createDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, data } = action.payload;
        const documentId = data._id;
        if (!documentId) {
          state.error = "Create document response is missing _id";
          state.loading = false;
          return;
        }
        const proj = state.byProject[projectId] ?? empty();
        if (!proj.content[collectionName]) proj.content[collectionName] = {};
        const entry = { ...data };
        delete entry._id;
        proj.content[collectionName][documentId] = entry;
        data._id = documentId;
        proj.ids[collectionName] = {
          ...(proj.ids[collectionName] ?? {
            _schema_name: collectionName, _schema: null, _document_ids: [],
            _document_statuses: {}, _document_labels: {},
          }),
          _document_ids: [...(proj.ids[collectionName]?._document_ids ?? []), documentId],
          _document_statuses: {
            ...(proj.ids[collectionName]?._document_statuses ?? {}),
            [documentId]: data._status ?? 'draft',
          },
        };
        state.byProject[projectId] = proj;
        state.loading = false;
      })
      .addCase(pullDocumentFromProd.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId, data } = action.payload;
        const proj = state.byProject[projectId] ?? empty();
        const entry = { ...data };
        delete entry._id;
        if (!proj.content[collectionName]) proj.content[collectionName] = {};
        proj.content[collectionName][documentId] = entry;
        if (proj.ids[collectionName]?._document_statuses) {
          proj.ids[collectionName]._document_statuses[documentId] = entry._status ?? 'draft';
        }
        state.byProject[projectId] = proj;
      })
      .addCase(deleteDocument.fulfilled, (state, action) => {
        const { projectId, collectionName, documentId } = action.payload;
        const proj = state.byProject[projectId];
        if (!proj?.ids[collectionName]) return;
        proj.ids[collectionName]._document_ids = (proj.ids[collectionName]._document_ids ?? [])
          .filter((id) => id !== documentId);
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
          delete entry._id;
          proj.content[collectionName][documentId] = entry;
        }
        state.byProject[projectId] = proj;
      });
  },
});

export default documentSlice.reducer;
