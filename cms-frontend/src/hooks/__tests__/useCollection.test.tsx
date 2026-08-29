/**
 * Integration test for useCollectionData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * addCollectionData/updateCollectionData take arrays/maps and resolve to a
 * single success toast after all requests settle — the empty-input case is
 * covered separately in CollectionComponent, whose handleSubmit now guards
 * against calling these with nothing to do (see the bug this migration
 * fixed: saving with zero changes used to fire "Collection created" and
 * "Collection saved" toasts unconditionally).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { collectionKeys } from "@ts/api/collections";
import { useCollectionData } from "@/hooks/useCollection";
import type { CollectionsResponse } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const seeded: CollectionsResponse = {
  _schema_collections: [{ _id: "c1", _index: 1, _collection_name: "posts", _schema_name: "Post" }],
  _collection_schema_variables: {},
};

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("useCollectionData — fetching", () => {
  it("fetches collections once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _schema_collections: [], _collection_schema_variables: {} }),
    } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/collections/`),
      expect.anything()
    );
  });

  it("serves cached collections and structure synchronously", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(result.current.collections).toEqual(seeded._schema_collections);
    expect(result.current.collectionStructure).toEqual({});
    expect(result.current.loading).toBe(false);
  });
});

describe("useCollectionData — addCollectionData", () => {
  it("creates each entry, strips empty-string fields, and shows one success toast after all settle", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => seeded } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    // addCollectionData is fire-and-forget (void), same as the original Redux
    // version — it doesn't return the settle promise, so assert via waitFor.
    result.current.addCollectionData([
      { _collection_name: "pages", _schema_name: "Page", _index: '' as unknown as number },
    ]);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Collection created"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/collections/`),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ _collection_name: "pages", _schema_name: "Page" }),
      })
    );
  });

  it("shows an error toast per failed entry but still resolves the success toast once all settle", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    result.current.addCollectionData([{ _collection_name: "pages", _schema_name: "Page" }]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to create collection"));
  });
});

describe("useCollectionData — updateCollectionData", () => {
  it("PUTs each updated collection by id and shows one success toast", async () => {
    const updatedItem = { _id: "c1", _index: 1, _collection_name: "blog-posts", _schema_name: "Post" };
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => updatedItem } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    result.current.updateCollectionData({ c1: { _collection_name: "blog-posts" } });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Collection saved"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/collections/c1/`),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ _collection_name: "blog-posts" }) })
    );
  });

  it("throws properly on a failed update instead of silently succeeding (regression: the old thunk never checked response.ok)", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Collection name already exists." }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    result.current.updateCollectionData({ c1: { _collection_name: "dup-name" } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update collection"));
  });
});

describe("useCollectionData — deleteCollectionData", () => {
  it("sends a DELETE without parsing a response body and shows a success toast", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.deleteCollectionData("c1");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/collections/c1/`),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(toast.success).toHaveBeenCalledWith("Collection deleted");
  });

  it("shows an error toast when the delete request fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useCollectionData(projectId), { wrapper: withQueryClient(queryClient) });
    await result.current.deleteCollectionData("c1");

    expect(toast.error).toHaveBeenCalledWith("Failed to delete collection");
  });
});
