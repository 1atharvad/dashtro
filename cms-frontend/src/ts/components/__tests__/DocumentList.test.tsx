/**
 * Integration tests for DocumentList: a real QueryClient with `authFetch`
 * mocked, following the same pattern as useSchema.test.tsx. Routing context
 * is supplied via MemoryRouter since the component reads useParams/useNavigate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { DocumentList } from "@ts/components/DocumentList";
import type { CollectionMeta, SchemaCollectionItem } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const collections: SchemaCollectionItem[] = [
  { _id: "coll-1", _index: 1, _collection_name: "posts", _schema_name: "Post" },
];

const meta: CollectionMeta = {
  _schema_name: "Post",
  _schema: {},
  _document_ids: ["doc-1", "doc-2"],
  _document_statuses: { "doc-1": "published", "doc-2": "draft" },
  _document_labels: { "doc-1": "First post", "doc-2": "Second post" },
};

const renderDocumentList = (workspaceName: string, queryClient = createTestQueryClient()) =>
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/workspace/${workspaceName}/collection/posts/`]}>
      <Routes>
        <Route
          path="/projects/:project_id/workspace/:workspace_name/collection/:collection_name/"
          element={(
            <DocumentList
              workspaceName={workspaceName}
              collectionName="posts"
              schemaName="Post"
              collections={collections}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
    { wrapper: withQueryClient(queryClient) }
  );

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("DocumentList", () => {
  it("renders documents with their labels and statuses (production: no diff fetch)", async () => {
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/collection/posts/")) return { ok: true, json: async () => meta } as Response;
      if (url.includes("/workspaces/")) return { ok: true, json: async () => [] } as Response;
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderDocumentList("production");

    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Second post")).toBeInTheDocument();
    expect(mockedAuthFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/diff-vs-production/"),
      expect.anything()
    );
    // Production documents are always considered published.
    expect(screen.getAllByText("Published")).toHaveLength(2);
  });

  it("shows the empty state with a New Document button for a non-production workspace", async () => {
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/collection/posts/")) {
        return { ok: true, json: async () => ({ ...meta, _document_ids: [], _document_labels: {}, _document_statuses: {} }) } as Response;
      }
      if (url.includes("/diff-vs-production/")) return { ok: true, json: async () => ({}) } as Response;
      if (url.includes("/workspaces/")) return { ok: true, json: async () => [] } as Response;
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderDocumentList("staging");

    expect(await screen.findByText(/No documents currently added/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New Document/ })).toBeInTheDocument();
  });

  it("marks a document out-of-sync as Draft when the workspace diff reports it modified", async () => {
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/collection/posts/")) return { ok: true, json: async () => meta } as Response;
      if (url.includes("/diff-vs-production/")) {
        return {
          ok: true,
          json: async () => ({ "coll-1": { modified: [{ document_id: "doc-1" }], source_only: [] } }),
        } as Response;
      }
      if (url.includes("/workspaces/")) return { ok: true, json: async () => [] } as Response;
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderDocumentList("staging");

    await screen.findByText("First post");
    await waitFor(() => expect(screen.getAllByText("Draft")).toHaveLength(1));
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

});
