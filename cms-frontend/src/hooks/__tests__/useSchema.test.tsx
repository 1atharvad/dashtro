/**
 * Integration test for useSchemaData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * useSchemaMetaData (schema names/variables) is backed by the same
 * QueryClient, seeded directly via its query key.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { schemaPresetKeys } from "@ts/api/schemaPresets";
import { useSchemaData } from "@/hooks/useSchema";
import type { SchemaFieldItem, SchemaListResponse } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const preset: SchemaListResponse = {
  _schema_names: ["Article", "Author"],
  _schema_variables: {},
};

const articleField: SchemaFieldItem = {
  _id: "f1", _index: 1, _name: "title", _type: "String", _description: "",
  _relation: "OneToOne", _default_value: "", _placeholder: "", _nested_schema: "",
  _reference_schema: [], _rich_text_wrapper: "", _display_name: true, _required: false,
};

const authorNestedField: SchemaFieldItem = {
  ...articleField, _id: "f2", _index: 2, _name: "author", _nested_schema: "Author",
};

const seedMetaCache = (queryClient: ReturnType<typeof createTestQueryClient>) =>
  queryClient.setQueryData(schemaPresetKeys.byProject(projectId), preset);

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("useSchemaData — fetching", () => {
  it("fetches the root schema and exposes its fields", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ Article: [articleField] }) } as Response);
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schemaNameData).toEqual([articleField]);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/Article/`),
      expect.anything()
    );
  });

  it("skips the fetch entirely for a not-yet-created schema (regression: used to fire a guaranteed-404 request and log an error)", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(
      () => useSchemaData(projectId, "BrandNewSchema", true),
      { wrapper: withQueryClient(queryClient) }
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.schemaNameData).toEqual([]);
    expect(mockedAuthFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/schema/BrandNewSchema/"),
      expect.anything()
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("discovers and fetches a nested schema referenced by a field, but not a self-reference or an unknown schema", async () => {
    const selfRefField = { ...articleField, _id: "f3", _index: 3, _name: "self", _nested_schema: "Article" };
    const unknownRefField = { ...articleField, _id: "f4", _index: 4, _name: "ghost", _nested_schema: "Ghost" };
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/schema/Article/")) {
        return { ok: true, json: async () => ({ Article: [authorNestedField, selfRefField, unknownRefField] }) } as Response;
      }
      if (url.includes("/schema/Author/")) {
        return { ok: true, json: async () => ({ Author: [articleField] }) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });

    await waitFor(() => expect(result.current.schemaDetails["Author"]).toEqual([articleField]));
    expect(mockedAuthFetch).not.toHaveBeenCalledWith(expect.stringContaining("/schema/Ghost/"), expect.anything());
  });

  it("resets fetched schemas when schemaName changes", async () => {
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => ({
      ok: true,
      json: async () => (String(input).includes("Article") ? { Article: [articleField] } : { Author: [] }),
    } as Response));
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result, rerender } = renderHook(
      ({ name }) => useSchemaData(projectId, name),
      { wrapper: withQueryClient(queryClient), initialProps: { name: "Article" } }
    );
    await waitFor(() => expect(result.current.schemaNameData).toEqual([articleField]));

    rerender({ name: "Author" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schemaNameData).toEqual([]);
    expect(Object.keys(result.current.schemaDetails)).toEqual(["Author"]);
  });
});

describe("useSchemaData — addSchemaData", () => {
  it("no-ops without a network call or toast when given an empty list (regression: unconditional save toast)", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ Article: [] }) } as Response);
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockedAuthFetch.mockClear();

    result.current.addSchemaData([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });

  it("creates each field, strips empty-string values, and shows one success toast", async () => {
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ ...articleField, _schema_name: "Article" }) } as Response;
      }
      return { ok: true, json: async () => ({ Article: [] }) } as Response;
    });
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.addSchemaData([{ _name: "title", _placeholder: "" }]);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Schema field added"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/`),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ _name: "title" }) })
    );
  });
});

describe("useSchemaData — updateSchemaData", () => {
  it("PUTs each updated field by id and shows one success toast", async () => {
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return { ok: true, json: async () => ({ ...articleField, _name: "renamed", _schema_name: "Article" }) } as Response;
      }
      return { ok: true, json: async () => ({ Article: [articleField] }) } as Response;
    });
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.updateSchemaData({ f1: { _name: "renamed" } });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Schema saved"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/f1/`),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ _name: "renamed" }) })
    );
  });
});

describe("useSchemaData — deleteSchemaData", () => {
  it("sends a DELETE, shows a success toast, and resolves true", async () => {
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "DELETE") return { ok: true } as Response;
      return { ok: true, json: async () => ({ Article: [articleField] }) } as Response;
    });
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.deleteSchemaData("f1")).resolves.toBe(true);

    expect(toast.success).toHaveBeenCalledWith("Schema field deleted");
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/f1/`),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows an error toast and resolves false when the delete request fails (regression: callers used to treat this as success)", async () => {
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "DELETE") return { ok: false, status: 400 } as Response;
      return { ok: true, json: async () => ({ Article: [articleField] }) } as Response;
    });
    const queryClient = createTestQueryClient();
    seedMetaCache(queryClient);

    const { result } = renderHook(() => useSchemaData(projectId, "Article"), { wrapper: withQueryClient(queryClient) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.deleteSchemaData("f1")).resolves.toBe(false);

    expect(toast.error).toHaveBeenCalledWith("Failed to delete schema field");
  });
});
