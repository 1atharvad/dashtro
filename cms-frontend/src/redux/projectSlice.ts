import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";

export const fetchProjects = createAsyncThunk("projects/fetchProjects", async () => {
  const response = await fetch(`${API_BASE_URL}/projects/`);
  if (!response.ok) throw new Error(`Failed to fetch projects: ${response.status}`);
  return await response.json();
});

export const createProject = createAsyncThunk("projects/createProject", async (
  newProject: { name: string; description?: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newProject),
  });
  if (!response.ok) throw new Error("Failed to create project");
  return await response.json();
});

export const updateProject = createAsyncThunk("projects/updateProject", async (
  { projectId, data }: { projectId: string; data: { name: string; description?: string } }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update project");
  return await response.json();
});

export const deleteProject = createAsyncThunk("projects/deleteProject", async (
  projectId: string
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete project");
  return { _id: projectId };
});

type Project = { _id: string; name: string; description: string; created_at: string; updated_at: string };

const projectSlice = createSlice({
  name: "projects",
  initialState: {
    projects: [] as Project[],
    loading: true,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.loading = true; })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false;
        state.projects = action.payload;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch projects";
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects = [...state.projects, action.payload];
      })
      .addCase(createProject.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to create project";
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        state.projects = state.projects.map(p =>
          p._id === action.payload._id ? action.payload : p
        );
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter(p => p._id !== action.payload._id);
      });
  },
});

export default projectSlice.reducer;
