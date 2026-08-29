/**
 * Integration test for useWorkspaceData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * Covers the workspace list/CRUD operations plus the fetch-on-demand diff
 * pattern (fetchDiff/getCachedDiff), which is deliberately not a bound
 * useQuery — see the comment on useWorkspaceDiff in src/ts/api/workspaces.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { workspaceKeys, type Workspace } from "@ts/api/workspaces";
import { useWorkspaceData } from "@/hooks/useWorkspace";
import type { WorkspaceDiff } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const existing: Workspace = { workspace_name: "staging", is_production: false, created_at: "" };

beforeEach(() => {
  mockedAuthFetch.mockReset();
});

describe("useWorkspaceData — fetching", () => {
  it("fetches workspaces once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => [] } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspaces/`),
      expect.anything()
    );
  });

  it("serves cached workspaces synchronously without a loading state", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.byProject(projectId), [existing]);

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(result.current.workspaces).toEqual([existing]);
    expect(result.current.loading).toBe(false);
  });
});

describe("useWorkspaceData — addWorkspace", () => {
  it("posts the new workspace name and invalidates the cache", async () => {
    const created: Workspace = { workspace_name: "dev", is_production: false, created_at: "" };
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => created } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.byProject(projectId), [existing]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });
    const workspace = await result.current.addWorkspace("dev");

    expect(workspace).toEqual(created);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspaces/`),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ workspace_name: "dev" }) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: workspaceKeys.byProject(projectId) })
    );
  });

  it("rejects with the backend's detail message when the name is invalid", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "'production' is reserved." }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.byProject(projectId), [existing]);

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.addWorkspace("production")).rejects.toThrow("'production' is reserved.");
  });
});

describe("useWorkspaceData — removeWorkspace", () => {
  it("sends a DELETE without parsing a response body and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.byProject(projectId), [existing]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.removeWorkspace("staging");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspaces/staging/`),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: workspaceKeys.byProject(projectId) })
    );
  });

  it("rejects when the delete request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.byProject(projectId), [existing]);

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.removeWorkspace("staging")).rejects.toThrow();
  });
});

describe("useWorkspaceData — pushWorkspaceToProd", () => {
  it("posts to push-to-prod and invalidates that workspace's diff cache", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(workspaceKeys.diff(projectId, "staging"), { posts: {} } as unknown as WorkspaceDiff);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.pushWorkspaceToProd("staging");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspaces/staging/push-to-prod/`),
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: workspaceKeys.diff(projectId, "staging") })
    );
  });

  it("rejects when the push fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.pushWorkspaceToProd("staging")).rejects.toThrow();
  });
});

describe("useWorkspaceData — pullWorkspaceFromProd", () => {
  it("posts the resolutions map and invalidates that workspace's diff cache", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resolutions = { "posts:doc-1": "production" as const };

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.pullWorkspaceFromProd("staging", resolutions);

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspaces/staging/pull-from-production/`),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ resolutions }) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: workspaceKeys.diff(projectId, "staging") })
    );
  });

  it("rejects when the pull fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.pullWorkspaceFromProd("staging", {})).rejects.toThrow();
  });
});

describe("useWorkspaceData — fetchDiff / getCachedDiff", () => {
  it("getCachedDiff returns undefined before any fetch, then the fetched value after", async () => {
    const diff = { posts: { source_only: [], target_only: [], modified: [] } } as unknown as WorkspaceDiff;
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => diff } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(result.current.getCachedDiff("staging")).toBeUndefined();

    const fetched = await result.current.fetchDiff("staging");

    expect(fetched).toEqual(diff);
    expect(result.current.getCachedDiff("staging")).toEqual(diff);
  });

  it("shares the fetched diff across independently-rendered hook instances for the same workspace", async () => {
    const diff = { posts: { source_only: [], target_only: [], modified: [] } } as unknown as WorkspaceDiff;
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => diff } as Response);
    const queryClient = createTestQueryClient();

    const first = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });
    await first.result.current.fetchDiff("staging");

    // A second hook instance (e.g. a different mounted component) reads the
    // same cache without fetching again — this is the whole point of routing
    // fetchDiff through queryClient.fetchQuery instead of local state.
    const second = renderHook(() => useWorkspaceData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(second.result.current.getCachedDiff("staging")).toEqual(diff);
  });
});
