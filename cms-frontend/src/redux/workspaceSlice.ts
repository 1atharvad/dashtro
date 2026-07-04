import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type { WorkspaceDiff } from '@ts/types/constants';

export const fetchWorkspaces = createAsyncThunk("workspaces/fetchWorkspaces", async (
  projectId: string
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/workspaces/`);
  if (!response.ok) throw new Error(`Failed to fetch workspaces: ${response.status}`);
  return { projectId, workspaces: await response.json() };
});

export const createWorkspace = createAsyncThunk("workspaces/createWorkspace", async (
  { projectId, workspaceName }: { projectId: string; workspaceName: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/workspaces/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_name: workspaceName }),
  });
  if (!response.ok) {
    const err = await response.json();
    const detail = err.detail;
    const message = Array.isArray(detail)
      ? detail.map((e: { msg: string }) => e.msg).join('; ')
      : (detail ?? "Failed to create workspace");
    throw new Error(message);
  }
  return { projectId, workspace: await response.json() };
});

export const deleteWorkspace = createAsyncThunk("workspaces/deleteWorkspace", async (
  { projectId, workspaceName }: { projectId: string; workspaceName: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/workspaces/${workspaceName}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete workspace");
  return { projectId, workspaceName };
});

export const pushToProd = createAsyncThunk("workspaces/pushToProd", async (
  { projectId, workspaceName }: { projectId: string; workspaceName: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/workspaces/${workspaceName}/push-to-prod/`,
    { method: "POST" }
  );
  if (!response.ok) throw new Error("Failed to push to production");
  return await response.json();
});

export const fetchWorkspaceDiff = createAsyncThunk("workspaces/fetchWorkspaceDiff", async (
  { projectId, workspaceName }: { projectId: string; workspaceName: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/workspaces/${workspaceName}/diff-vs-production/`
  );
  if (!response.ok) throw new Error("Failed to compute diff");
  return (await response.json()) as WorkspaceDiff;
});

export const pullFromProd = createAsyncThunk("workspaces/pullFromProd", async (
  { projectId, workspaceName, resolutions }:
    { projectId: string; workspaceName: string; resolutions: Record<string, "production" | "workspace"> }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/workspaces/${workspaceName}/pull-from-production/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutions }),
    }
  );
  if (!response.ok) throw new Error("Failed to pull from production");
  return await response.json();
});

type Workspace = { workspace_name: string; is_production: boolean; created_at: string };

const workspaceSlice = createSlice({
  name: "workspaces",
  initialState: {
    byProject: {} as Record<string, Workspace[]>,
    // Cached by `${projectId}:${workspaceName}` so components mounting after
    // a diff was already fetched elsewhere (e.g. navigating list -> document)
    // can render immediately instead of independently re-fetching.
    diffByWorkspace: {} as Record<string, WorkspaceDiff>,
    loading: false,
    error: null as string | null,
    pushSuccess: false,
  },
  reducers: {
    clearPushSuccess: (state) => { state.pushSuccess = false; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => { state.loading = true; })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.workspaces;
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch workspaces";
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        const { projectId, workspace } = action.payload;
        state.byProject[projectId] = [...(state.byProject[projectId] ?? []), workspace];
      })
      .addCase(createWorkspace.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to create workspace";
      })
      .addCase(deleteWorkspace.fulfilled, (state, action) => {
        const { projectId, workspaceName } = action.payload;
        state.byProject[projectId] = (state.byProject[projectId] ?? [])
          .filter(w => w.workspace_name !== workspaceName);
      })
      .addCase(pushToProd.pending, (state) => { state.pushSuccess = false; })
      .addCase(pushToProd.fulfilled, (state) => { state.pushSuccess = true; })
      .addCase(pushToProd.rejected, (state, action) => {
        state.error = action.error.message ?? "Push to production failed";
      })
      .addCase(fetchWorkspaceDiff.fulfilled, (state, action) => {
        const { projectId, workspaceName } = action.meta.arg;
        state.diffByWorkspace[`${projectId}:${workspaceName}`] = action.payload;
      })
      .addCase(fetchWorkspaceDiff.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to compute diff";
      })
      .addCase(pullFromProd.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to pull from production";
      });
  },
});

export const { clearPushSuccess } = workspaceSlice.actions;
export default workspaceSlice.reducer;
