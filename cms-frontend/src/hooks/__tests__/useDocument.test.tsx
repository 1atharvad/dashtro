/**
 * Integration test for useDocumentData: a real QueryClient wrapped around
 * `renderHook`, with `authFetch` mocked so no real network call happens.
 * The hook has two modes driven by `documentId`: list mode (no documentId,
 * or documentId === defaultId) fetches collection meta; detail mode fetches
 * a single document.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { documentKeys } from "@ts/api/documents";
import { useDocumentData } from "@/hooks/useDocument";
import type { CollectionMeta, DocumentData } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";
const workspaceName = "main";
const collectionName = "posts";

const meta: CollectionMeta = {
  _schema_name: "Post",
  _schema: null,
  _document_ids: ["doc-1"],
  _document_statuses: { "doc-1": "draft" },
  _document_labels: { "doc-1": "Hello" },
};

const doc: DocumentData = { _id: "doc-1", title: "Hello" };

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("useDocumentData — list mode (no documentId)", () => {
  it("fetches collection meta and exposes ids/statuses/labels keyed by collectionName", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => meta } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName),
      { wrapper: withQueryClient(queryClient) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.collDocumentIds).toEqual({ [collectionName]: ["doc-1"] });
    expect(result.current.collDocumentStatuses).toEqual({ [collectionName]: { "doc-1": "draft" } });
    expect(result.current.collDocumentLabels).toEqual({ [collectionName]: { "doc-1": "Hello" } });
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}/`),
      expect.anything()
    );
  });
});

describe("useDocumentData — detail mode", () => {
  it("fetches the document and exposes it under collDocumentContent", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => doc } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.collDocumentContent).toEqual({ [collectionName]: { "doc-1": doc } });
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/document/doc-1/?depth=1`),
      expect.anything()
    );
  });
});

describe("useDocumentData — addDocumentData", () => {
  it("creates the document, strips empty-string fields, shows a success toast, and returns the created data", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => doc } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "new"),
      { wrapper: withQueryClient(queryClient) }
    );

    const created = await result.current.addDocumentData({ title: "Hello", subtitle: "" });

    expect(created).toEqual(doc);
    expect(toast.success).toHaveBeenCalledWith("Document created");
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}/`),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Hello" }) })
    );
  });

  it("seeds the new document's detail cache so navigating to it doesn't refetch (regression: used to require an extra GET)", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => doc } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "new"),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.addDocumentData({ title: "Hello" });

    expect(queryClient.getQueryData(documentKeys.detail(projectId, workspaceName, collectionName, "doc-1"))).toEqual(doc);
  });

  it("shows an error toast and returns undefined when creation fails", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 400 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "new"),
      { wrapper: withQueryClient(queryClient) }
    );

    const created = await result.current.addDocumentData({ title: "Hello" });

    expect(created).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Failed to create document");
  });
});

describe("useDocumentData — updateDocumentData", () => {
  it("PUTs the updated document and shows a success toast", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ ...doc, title: "Updated" }) } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.updateDocumentData({ title: "Updated" });

    expect(toast.success).toHaveBeenCalledWith("Document saved");
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/document/doc-1/`),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "Updated" }) })
    );
  });

  it("shows an error toast when the update fails, instead of silently succeeding", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false, status: 400, json: async () => ({ detail: "Validation failed." }),
    } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.updateDocumentData({ title: "Bad" });

    expect(toast.error).toHaveBeenCalledWith("Failed to save document");
  });
});

describe("useDocumentData — deleteDocumentData", () => {
  it("sends a DELETE and shows a success toast", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(documentKeys.collection(projectId, workspaceName, collectionName), meta);

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName),
      { wrapper: withQueryClient(queryClient) }
    );

    result.current.deleteDocumentData("doc-1");

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Document deleted"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/document/doc-1/`),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("useDocumentData — production sync", () => {
  it("pushCollectionData resolves and shows a success toast", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.pushCollectionData();

    expect(toast.success).toHaveBeenCalledWith("Collection pushed to production");
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/push-to-prod/`),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("pushCollectionData shows an error toast and rethrows on failure", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName),
      { wrapper: withQueryClient(queryClient) }
    );

    await expect(result.current.pushCollectionData()).rejects.toThrow();
    expect(toast.error).toHaveBeenCalledWith("Failed to push collection to production");
  });

  it("pullDocumentData updates the cached document content and status", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true, json: async () => ({ _id: "doc-1", title: "From prod", _status: "published" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(documentKeys.collection(projectId, workspaceName, collectionName), meta);
    queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, "doc-1"), doc);

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.pullDocumentData("doc-1");

    expect(toast.success).toHaveBeenCalledWith("Document updated from production");
    await waitFor(() =>
      expect(result.current.collDocumentContent[collectionName]["doc-1"]).toEqual({
        title: "From prod", _status: "published",
      })
    );
    expect(result.current.collDocumentStatuses[collectionName]["doc-1"]).toBe("published");
  });
});

describe("useDocumentData — versions", () => {
  it("fetchVersions triggers a fetch for the currently open document and populates versions", async () => {
    const versions = [{ id: "v1", version_number: 1, created_at: "2026-01-01", created_by_id: "u1", created_by_email: "a@b.com" }];
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => versions } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, "doc-1"), doc);

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    expect(result.current.versions).toEqual([]);
    result.current.fetchVersions("doc-1");

    await waitFor(() => expect(result.current.versions).toEqual(versions));
  });

  it("restoreVersion restores the version and shows a success toast", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true, json: async () => ({ _id: "doc-1", title: "Restored" }),
    } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(documentKeys.detail(projectId, workspaceName, collectionName, "doc-1"), doc);

    const { result } = renderHook(
      () => useDocumentData(projectId, collectionName, workspaceName, "doc-1"),
      { wrapper: withQueryClient(queryClient) }
    );

    await result.current.restoreVersion("doc-1", "v1");

    expect(toast.success).toHaveBeenCalledWith("Version restored");
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/versions/v1/restore/`),
      expect.objectContaining({ method: "POST" })
    );
  });
});
