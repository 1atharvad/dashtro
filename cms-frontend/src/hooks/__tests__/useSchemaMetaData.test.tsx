/**
 * Integration test for useSchemaMetaData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * addNewSchemeName/removeSchemaName are local cache patches (no network
 * call), used by other hooks (e.g. useSchema) right after some other
 * mutation creates/deletes a schema field — covered here directly rather
 * than through that cross-hook composition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { schemaPresetKeys } from "@ts/api/schemaPresets";
import { useSchemaMetaData } from "@/hooks/useSchemaMetaData";
import type { SchemaListResponse } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const seeded: SchemaListResponse = {
  _schema_names: ["Post", "Author"],
  _schema_variables: {},
};

beforeEach(() => {
  mockedAuthFetch.mockReset();
  // Default happy-path response so a query's background revalidation (from
  // seeding cache data with staleTime: 0) doesn't reject unhandled in tests
  // that aren't asserting on the fetch itself.
  mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => seeded } as Response);
});

describe("useSchemaMetaData — fetching", () => {
  it("fetches schema metadata once on mount when the cache starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _schema_names: [], _schema_variables: {} }),
    } as Response);
    const queryClient = createTestQueryClient();

    renderHook(() => useSchemaMetaData(projectId), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/`),
      expect.anything()
    );
  });

  it("serves cached schema names and variables synchronously without a loading state", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(schemaPresetKeys.byProject(projectId), seeded);

    const { result } = renderHook(() => useSchemaMetaData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(result.current.schemaNames).toEqual(["Post", "Author"]);
    expect(result.current.schemaVariables).toEqual({});
    expect(result.current.loading).toBe(false);
  });
});

describe("useSchemaMetaData — addNewSchemeName", () => {
  it("appends the name to the cache directly, synchronously", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(schemaPresetKeys.byProject(projectId), seeded);

    const { result, rerender } = renderHook(() => useSchemaMetaData(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    result.current.addNewSchemeName("Category");
    rerender();

    expect(result.current.schemaNames).toEqual(["Post", "Author", "Category"]);
  });

  it("is a no-op when the name is already present", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(schemaPresetKeys.byProject(projectId), seeded);

    const { result, rerender } = renderHook(() => useSchemaMetaData(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    result.current.addNewSchemeName("Post");
    rerender();

    expect(result.current.schemaNames).toEqual(["Post", "Author"]);
  });
});

describe("useSchemaMetaData — removeSchemaName", () => {
  it("removes the name from the cache directly, synchronously", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(schemaPresetKeys.byProject(projectId), seeded);

    const { result, rerender } = renderHook(() => useSchemaMetaData(projectId), {
      wrapper: withQueryClient(queryClient),
    });
    result.current.removeSchemaName("Author");
    rerender();

    expect(result.current.schemaNames).toEqual(["Post"]);
  });
});

describe("useSchemaMetaData — cross-instance sync", () => {
  it("a cache patch from one hook instance is visible in another instance for the same project", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(schemaPresetKeys.byProject(projectId), seeded);

    const first = renderHook(() => useSchemaMetaData(projectId), { wrapper: withQueryClient(queryClient) });
    first.result.current.addNewSchemeName("Category");

    const second = renderHook(() => useSchemaMetaData(projectId), { wrapper: withQueryClient(queryClient) });

    expect(second.result.current.schemaNames).toEqual(["Post", "Author", "Category"]);
  });
});
