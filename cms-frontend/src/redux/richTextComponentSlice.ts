import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { API_BASE_URL } from "@ts/config";
import { authFetch } from "@ts/utils/auth";
import type { RichTextComponent } from '@ts/types/constants';

type RichTextComponentState = {
  byProject: Record<string, RichTextComponent[]>;
  loading: boolean;
  error: string | null;
};

// FastAPI returns either a plain string detail (e.g. duplicate name) or a list
// of pydantic validation errors (e.g. bad name format) — surface either as text.
const extractErrorDetail = async (response: Response, fallback: string): Promise<string> => {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return (detail as { msg?: string }[]).map((e) => e.msg).filter(Boolean).join(' ') || fallback;
  }
  return fallback;
};

export const fetchRichTextComponents = createAsyncThunk("richTextComponents/fetch", async (projectId: string) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/rich-text-components/`);
  if (!response.ok) throw new Error(`Failed to fetch rich text components: ${response.status}`);
  return { projectId, components: await response.json() as RichTextComponent[] };
});

export const createRichTextComponent = createAsyncThunk("richTextComponents/create", async (
  { projectId, name, source, css, sampleHtml }:
    { projectId: string; name: string; source: string; css?: string; sampleHtml?: string }
) => {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/rich-text-components/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source, css: css ?? '', sampleHtml: sampleHtml ?? '' }),
  });
  if (!response.ok) throw new Error(await extractErrorDetail(response, `Failed to create component: ${response.status}`));
  return { projectId, component: await response.json() as RichTextComponent };
});

export const updateRichTextComponent = createAsyncThunk("richTextComponents/update", async (
  { projectId, componentId, name, source, css, sampleHtml }:
    { projectId: string; componentId: string; name: string; source: string; css: string; sampleHtml: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/rich-text-components/${componentId}/`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, source, css, sampleHtml }),
    }
  );
  if (!response.ok) throw new Error(await extractErrorDetail(response, `Failed to update component: ${response.status}`));
  return { projectId, component: await response.json() as RichTextComponent };
});

export const deleteRichTextComponent = createAsyncThunk("richTextComponents/delete", async (
  { projectId, componentId }: { projectId: string; componentId: string }
) => {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/rich-text-components/${componentId}/`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Failed to delete component: ${response.status}`);
  return { projectId, componentId };
});

const richTextComponentSlice = createSlice({
  name: "richTextComponents",
  initialState: {
    byProject: {} as Record<string, RichTextComponent[]>,
    loading: false,
    error: null as string | null,
  } as RichTextComponentState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRichTextComponents.pending, (state) => { state.loading = true; })
      .addCase(fetchRichTextComponents.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.components;
      })
      .addCase(fetchRichTextComponents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? null;
      })
      .addCase(createRichTextComponent.fulfilled, (state, action) => {
        const { projectId, component } = action.payload;
        state.byProject[projectId] = [...(state.byProject[projectId] ?? []), component];
      })
      .addCase(updateRichTextComponent.fulfilled, (state, action) => {
        const { projectId, component } = action.payload;
        const list = state.byProject[projectId];
        if (!list) return;
        state.byProject[projectId] = list.map(c => c.id === component.id ? component : c);
      })
      .addCase(deleteRichTextComponent.fulfilled, (state, action) => {
        const { projectId, componentId } = action.payload;
        const list = state.byProject[projectId];
        if (!list) return;
        state.byProject[projectId] = list.filter(c => c.id !== componentId);
      });
  },
});

export default richTextComponentSlice.reducer;
