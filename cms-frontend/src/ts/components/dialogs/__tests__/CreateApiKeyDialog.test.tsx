import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { collectionKeys } from "@ts/api/collections";
import { CreateApiKeyDialog } from "@ts/components/dialogs/CreateApiKeyDialog";

vi.mock("@ts/utils/auth", () => ({ authFetch: vi.fn() }));
import { authFetch } from "@ts/utils/auth";
const mockedAuthFetch = vi.mocked(authFetch);

const projects = [{ _id: "p1", name: "My Project" }];

describe("CreateApiKeyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React Query refetches on mount (staleTime: 0) even when the cache is
    // seeded directly, so an unmocked authFetch would fail that background
    // refetch and log noise even though the seeded data is what's asserted on.
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _schema_collections: [], _collection_schema_variables: {} }),
    } as Response);
  });

  it("disables Create until a label is entered", () => {
    render(
      <CreateApiKeyDialog open onClose={vi.fn()} projects={projects} onCreate={vi.fn()} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("creates an unscoped, read-only key by default", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <CreateApiKeyDialog open onClose={onClose} projects={projects} onCreate={onCreate} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await user.type(screen.getByLabelText("Label"), "Production");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      label: "Production",
      projectId: "",
      collections: [],
      scopes: ["read"],
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists collections for the selected project and includes checked ones on create", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const collectionsResponse = {
      _schema_collections: [{ _id: "c1", _index: 1, _collection_name: "posts", _schema_name: "Post" }],
      _collection_schema_variables: {},
    };
    // Override the default empty-collections mock so a background refetch
    // (staleTime: 0) doesn't clobber the seeded data with an empty list.
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => collectionsResponse } as Response);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(collectionKeys.byProject("p1"), collectionsResponse);

    render(
      <CreateApiKeyDialog open onClose={vi.fn()} projects={projects} onCreate={onCreate} />,
      { wrapper: withQueryClient(queryClient) }
    );

    await user.type(screen.getByLabelText("Label"), "Mobile");
    await user.click(screen.getByLabelText("Project"));
    await user.click(await screen.findByRole("option", { name: "My Project" }));

    await user.click(await screen.findByLabelText("posts"));
    await user.click(screen.getByLabelText("Write"));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      label: "Mobile",
      projectId: "p1",
      collections: ["posts"],
      scopes: ["read", "write"],
    }));
  });
});
