/**
 * Integration test for useProjectData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * Verifies the hook's query/mutation wiring without mocking the whole
 * fetch/Response cycle for every branch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { projectKeys, type Project } from "@ts/api/projects";
import { useProjectData } from "@/hooks/useProject";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);

const existing: Project = { _id: "1", name: "Existing", description: "", created_at: "", updated_at: "" };

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("useProjectData — fetching", () => {
  it("fetches projects once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
  });

  it("serves cached projects synchronously without a loading state", () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });

    expect(result.current.projects).toEqual([existing]);
    expect(result.current.loading).toBe(false);
  });

  it("surfaces the fetch error message when the initial load fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("500");
  });
});

describe("useProjectData — addProject", () => {
  it("posts the new project's name and description, and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _id: "new-id", name: "New", description: "desc" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, []);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    await result.current.addProject("New", "desc");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New", description: "desc" }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: projectKeys.all }));
  });

  it("shows an error toast and does not throw when the create request fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, []);

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.addProject("New", "desc")).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Failed to create project");
  });
});

describe("useProjectData — editProject", () => {
  it("PUTs the updated name and description, and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ...existing, name: "Renamed" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    await result.current.editProject("1", "Renamed", "");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/1/"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Renamed", description: "" }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: projectKeys.all }));
  });

  it("shows an error toast and does not throw when the update request fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.editProject("1", "Renamed", "")).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Failed to update project");
  });
});

describe("useProjectData — removeProject", () => {
  it("sends a DELETE without parsing a response body, shows a success toast, and returns true", async () => {
    // No `json` method on the mock: guards against apiRequest ever calling it for DELETE.
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    const success = await result.current.removeProject("1");

    expect(success).toBe(true);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/1/"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(toast.success).toHaveBeenCalledWith("Project deleted");
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: projectKeys.all }));
  });

  it("shows an error toast and returns false when the delete request fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    const success = await result.current.removeProject("1");

    expect(success).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Failed to delete project");
  });
});

describe("useProjectData — duplicateProjectData", () => {
  it("POSTs to the duplicate endpoint, shows a success toast, and returns the new project", async () => {
    const duplicated = { ...existing, _id: "2", name: "Existing (copy)" };
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => duplicated,
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    const created = await result.current.duplicateProjectData("1");

    expect(created).toEqual(duplicated);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/1/duplicate/"),
      expect.objectContaining({ method: "POST" })
    );
    expect(toast.success).toHaveBeenCalledWith("Project duplicated");
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: projectKeys.all }));
  });

  it("shows an error toast and returns null when the duplicate request fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectKeys.all, [existing]);

    const { result } = renderHook(() => useProjectData(), { wrapper: withQueryClient(queryClient) });
    const created = await result.current.duplicateProjectData("1");

    expect(created).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Failed to duplicate project");
  });
});
