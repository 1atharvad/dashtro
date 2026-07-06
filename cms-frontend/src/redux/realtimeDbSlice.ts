import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type { JsonValue, JsonObject } from '@ts/types/constants';

const rtdbUrl = (projectId: string, path: string) =>
  `${API_BASE_URL}/projects/${projectId}/rtdb/${path ? path : ""}`;

export const fetchRtdb = createAsyncThunk("realtimeDb/fetchRtdb", async (
  { projectId }: { projectId: string }
) => {
  const response = await authFetch(rtdbUrl(projectId, ""));
  if (!response.ok) throw new Error(`Failed to fetch realtime database: ${response.status}`);
  return { projectId, data: await response.json() as JsonValue };
});

export const putRtdbPath = createAsyncThunk("realtimeDb/putRtdbPath", async (
  // `raw`, when given, is sent verbatim as the request body instead of
  // JSON.stringify(value) — needed for float values, since JS's `number`
  // type can't distinguish 3 from 3.0 (JSON.stringify(3.0) === "3"), so a
  // float edit builds its own literal (e.g. "3.0") to preserve intent.
  { projectId, path, value, raw }: { projectId: string; path: string; value: JsonValue; raw?: string }
) => {
  const response = await authFetch(rtdbUrl(projectId, path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Failed to save realtime database: ${response.status}`);
  return { projectId, path, value };
});

export const patchRtdbPath = createAsyncThunk("realtimeDb/patchRtdbPath", async (
  { projectId, path, value }: { projectId: string; path: string; value: JsonObject }
) => {
  const response = await authFetch(rtdbUrl(projectId, path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Failed to update realtime database: ${response.status}`);
  return { projectId, path, value };
});

export const deleteRtdbPath = createAsyncThunk("realtimeDb/deleteRtdbPath", async (
  { projectId, path }: { projectId: string; path: string }
) => {
  const response = await authFetch(rtdbUrl(projectId, path), { method: "DELETE" });
  if (!response.ok) throw new Error(`Failed to delete realtime database path: ${response.status}`);
  return { projectId, path };
});

// These mirror the backend's array-aware path navigation (sqlite_client.py's
// _rtdb_get_child/_rtdb_set_child) so a list stored at some path stays a
// real JS array through Redux updates instead of decaying into a plain
// object — {...someArray} silently drops its Array-ness, which is what
// caused a list's "+ Add element" UI to vanish after its first item.
const cloneContainer = (node: JsonValue): JsonObject | JsonValue[] =>
  Array.isArray(node) ? [...node] : { ...(node as JsonObject) };

const getChild = (node: JsonValue, seg: string): JsonValue | undefined => {
  if (Array.isArray(node)) {
    const idx = Number(seg);
    return Number.isInteger(idx) && idx >= 0 && idx < node.length ? node[idx] : undefined;
  }
  return node ? (node as JsonObject)[seg] : undefined;
};

const setChild = (node: JsonObject | JsonValue[], seg: string, value: JsonValue) => {
  if (Array.isArray(node)) {
    const idx = Number(seg);
    if (!Number.isInteger(idx) || idx < 0) return;
    if (idx < node.length) node[idx] = value;
    else {
      while (node.length < idx) node.push(null);
      node.push(value);
    }
  } else {
    node[seg] = value;
  }
};

const deleteChild = (node: JsonObject | JsonValue[], seg: string) => {
  if (Array.isArray(node)) {
    const idx = Number(seg);
    if (Number.isInteger(idx) && idx >= 0 && idx < node.length) node.splice(idx, 1);
  } else if (node) {
    delete node[seg];
  }
};

const setAtPath = (tree: JsonValue, path: string, value: JsonValue): JsonValue => {
  const segments = path ? path.split('/').filter(Boolean) : [];
  if (segments.length === 0) return value && typeof value === 'object' ? value : {};
  const root = cloneContainer(tree);
  let node = root;
  for (const seg of segments.slice(0, -1)) {
    const existing = getChild(node, seg);
    const next = existing && typeof existing === 'object' ? cloneContainer(existing) : {};
    setChild(node, seg, next);
    node = next;
  }
  setChild(node, segments[segments.length - 1], value);
  return root;
};

const patchAtPath = (tree: JsonValue, path: string, value: JsonObject): JsonValue => {
  const segments = path ? path.split('/').filter(Boolean) : [];
  const root = cloneContainer(tree);
  let node = root;
  for (const seg of segments) {
    const existing = getChild(node, seg);
    const next = existing && typeof existing === 'object' ? cloneContainer(existing) : {};
    setChild(node, seg, next);
    node = next;
  }
  if (!Array.isArray(node)) Object.assign(node, value);
  return root;
};

const deleteAtPath = (tree: JsonValue, path: string): JsonValue => {
  const segments = path ? path.split('/').filter(Boolean) : [];
  if (segments.length === 0) return {};
  const root = cloneContainer(tree);
  let node = root;
  for (const seg of segments.slice(0, -1)) {
    const existing = getChild(node, seg);
    if (!existing || typeof existing !== 'object') return root;
    const next = cloneContainer(existing);
    setChild(node, seg, next);
    node = next;
  }
  deleteChild(node, segments[segments.length - 1]);
  return root;
};

type RealtimeDbState = {
  byProject: Record<string, JsonValue>;
  connectedProjects: Record<string, boolean>;
  loading: boolean;
  error: string | null;
};

const realtimeDbSlice = createSlice({
  name: "realtimeDb",
  initialState: {
    byProject: {},
    connectedProjects: {} as Record<string, boolean>,
    loading: true,
    error: null as string | null,
  } as RealtimeDbState,
  reducers: {
    rtdbRemoteUpdate: (state, action: PayloadAction<{
      projectId: string; path: string; type: 'put' | 'patch' | 'delete'; value: JsonValue;
    }>) => {
      const { projectId, path, type, value } = action.payload;
      // Immer's WritableDraft mapped type can't be computed over a
      // self-referential type without blowing up the compiler, so byProject
      // is treated as a plain (non-draft) record here — safe since we only
      // ever replace whole values, never mutate through the draft proxy.
      const byProject = state.byProject as unknown as Record<string, JsonValue>;
      const tree = byProject[projectId] ?? {};
      if (type === 'put') byProject[projectId] = setAtPath(tree, path, value);
      else if (type === 'patch') byProject[projectId] = patchAtPath(tree, path, value as JsonObject);
      else byProject[projectId] = deleteAtPath(tree, path);
    },
    rtdbConnectionChanged: (state, action: PayloadAction<{ projectId: string; connected: boolean }>) => {
      state.connectedProjects[action.payload.projectId] = action.payload.connected;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRtdb.pending, (state) => { state.loading = true; })
      .addCase(fetchRtdb.fulfilled, (state, action) => {
        state.loading = false;
        const { projectId, data } = action.payload;
        (state.byProject as unknown as Record<string, JsonValue>)[projectId] = data ?? {};
      })
      .addCase(fetchRtdb.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message!;
      })
      .addCase(putRtdbPath.fulfilled, (state, action) => {
        const { projectId, path, value } = action.payload;
        const byProject = state.byProject as unknown as Record<string, JsonValue>;
        byProject[projectId] = setAtPath(byProject[projectId] ?? {}, path, value);
      })
      .addCase(patchRtdbPath.fulfilled, (state, action) => {
        const { projectId, path, value } = action.payload;
        const byProject = state.byProject as unknown as Record<string, JsonValue>;
        byProject[projectId] = patchAtPath(byProject[projectId] ?? {}, path, value);
      })
      .addCase(deleteRtdbPath.fulfilled, (state, action) => {
        const { projectId, path } = action.payload;
        const byProject = state.byProject as unknown as Record<string, JsonValue>;
        byProject[projectId] = deleteAtPath(byProject[projectId] ?? {}, path);
      });
  },
});

export const { rtdbRemoteUpdate, rtdbConnectionChanged } = realtimeDbSlice.actions;
export default realtimeDbSlice.reducer;
