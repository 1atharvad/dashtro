/**
 * Integration tests for the rich-text-components API hooks. Unlike
 * projects/categories/workspaces, no wrapper hook exists here — three
 * different components each call these hooks directly for what they need
 * (read-only, update+delete, read+create), so the hooks themselves are
 * the right unit to test rather than a shared consumer-facing hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import {
  richTextComponentKeys,
  useRichTextComponentsQuery,
  useCreateRichTextComponentMutation,
  useUpdateRichTextComponentMutation,
  useDeleteRichTextComponentMutation,
} from "@ts/api/richTextComponents";
import type { RichTextComponent } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const existing: RichTextComponent = {
  id: "c1", name: "CalloutBox", source: "export default () => null;", css: "", sampleHtml: "",
};

beforeEach(() => {
  mockedAuthFetch.mockReset();
});

describe("useRichTextComponentsQuery", () => {
  it("fetches components once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => [] } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useRichTextComponentsQuery(projectId), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/rich-text-components/`),
      expect.anything()
    );
  });

  it("serves cached components synchronously", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(richTextComponentKeys.byProject(projectId), [existing]);

    const { result } = renderHook(() => useRichTextComponentsQuery(projectId), {
      wrapper: withQueryClient(queryClient),
    });

    expect(result.current.data).toEqual([existing]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useCreateRichTextComponentMutation", () => {
  it("posts the new component with css/sampleHtml defaulted to empty strings, and invalidates the cache", async () => {
    const created: RichTextComponent = { id: "c2", name: "Alert", source: "...", css: "", sampleHtml: "" };
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => created } as Response);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateRichTextComponentMutation(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    const component = await result.current.mutateAsync({ name: "Alert", source: "..." });

    expect(component).toEqual(created);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/rich-text-components/`),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Alert", source: "...", css: "", sampleHtml: "" }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: richTextComponentKeys.byProject(projectId) })
    );
  });

  it("rejects with the backend's detail message on a duplicate name", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Alert component already exists." }),
    } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCreateRichTextComponentMutation(projectId), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(
      result.current.mutateAsync({ name: "Alert", source: "..." })
    ).rejects.toThrow("Alert component already exists.");
  });
});

describe("useUpdateRichTextComponentMutation", () => {
  it("PUTs the full component fields and invalidates the cache", async () => {
    const updated: RichTextComponent = { ...existing, name: "Renamed" };
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => updated } as Response);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateRichTextComponentMutation(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    const component = await result.current.mutateAsync({
      componentId: "c1", name: "Renamed", source: existing.source, css: "", sampleHtml: "",
    });

    expect(component).toEqual(updated);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/rich-text-components/c1/`),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Renamed", source: existing.source, css: "", sampleHtml: "" }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: richTextComponentKeys.byProject(projectId) })
    );
  });
});

describe("useDeleteRichTextComponentMutation", () => {
  it("sends a DELETE without parsing a response body and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteRichTextComponentMutation(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    await result.current.mutateAsync("c1");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/rich-text-components/c1/`),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: richTextComponentKeys.byProject(projectId) })
    );
  });

  it("rejects when the delete request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useDeleteRichTextComponentMutation(projectId), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current.mutateAsync("c1")).rejects.toThrow();
  });
});
