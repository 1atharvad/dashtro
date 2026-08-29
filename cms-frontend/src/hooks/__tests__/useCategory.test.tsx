/**
 * Integration test for useCategory: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * Verifies the hook's query/mutation wiring for all five category
 * operations, keyed per-project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { categoryKeys, type ProjectCategories } from "@ts/api/categories";
import { useCategory } from "@/hooks/useCategory";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const seeded: ProjectCategories = {
  categories: [{ id: "cat-1", name: "Marketing" }],
  category_map: { Post: "cat-1" },
};

beforeEach(() => {
  mockedAuthFetch.mockReset();
});

describe("useCategory — fetching", () => {
  it("fetches categories once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ categories: [], category_map: {} }),
    } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-categories/`),
      expect.anything()
    );
  });

  it("does not fetch when projectId is empty", () => {
    const queryClient = createTestQueryClient();

    renderHook(() => useCategory(""), { wrapper: withQueryClient(queryClient) });

    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });

  it("serves cached categories and category map synchronously", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    expect(result.current.categories).toEqual(seeded.categories);
    expect(result.current.categoryMap).toEqual(seeded.category_map);
    expect(result.current.loading).toBe(false);
  });
});

describe("useCategory — addCategory", () => {
  it("posts the new category's name and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cat-2", name: "New Folder" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });
    const created = await result.current.addCategory("New Folder");

    expect(created).toEqual({ id: "cat-2", name: "New Folder" });
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-categories/`),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New Folder" }) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: categoryKeys.byProject(projectId) })
    );
  });

  it("rejects when the create request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.addCategory("New Folder")).rejects.toThrow();
  });
});

describe("useCategory — updateCategory", () => {
  it("PUTs the renamed category and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cat-1", name: "Renamed" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.updateCategory("cat-1", "Renamed");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-categories/cat-1/`),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "Renamed" }) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: categoryKeys.byProject(projectId) })
    );
  });

  it("rejects when the update request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.updateCategory("cat-1", "Renamed")).rejects.toThrow();
  });
});

describe("useCategory — removeCategory", () => {
  it("sends a DELETE without parsing a response body and invalidates the cache", async () => {
    // No `json` method on the mock: guards against apiRequest ever calling it for DELETE.
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.removeCategory("cat-1");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-categories/cat-1/`),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: categoryKeys.byProject(projectId) })
    );
  });

  it("rejects when the delete request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.removeCategory("cat-1")).rejects.toThrow();
  });
});

describe("useCategory — assignSchemaCategory", () => {
  it("PUTs the schema-category mapping without parsing a response body, and invalidates the cache", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.assignSchemaCategory("Post", "cat-1");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-category-map/Post/`),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ category_id: "cat-1" }) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: categoryKeys.byProject(projectId) })
    );
  });

  it("rejects when the assignment request fails, so callers can catch it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });

    await expect(result.current.assignSchemaCategory("Post", "cat-1")).rejects.toThrow();
  });
});

describe("useCategory — derived lookups", () => {
  it("getCategoryForSchema, getSchemasInCategory, and getGeneralSchemas read from the category map", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(categoryKeys.byProject(projectId), {
      categories: [{ id: "cat-1", name: "Marketing" }],
      category_map: { Post: "cat-1", Page: "cat-1", Author: "" },
    } as ProjectCategories);

    const { result } = renderHook(() => useCategory(projectId), { wrapper: withQueryClient(queryClient) });
    const schemaNames = ["Post", "Page", "Author"];

    expect(result.current.getCategoryForSchema("Post")).toBe("cat-1");
    expect(result.current.getCategoryForSchema("Author")).toBe("");
    expect(result.current.getSchemasInCategory("cat-1", schemaNames)).toEqual(["Post", "Page"]);
    expect(result.current.getGeneralSchemas(schemaNames)).toEqual(["Author"]);
  });
});
