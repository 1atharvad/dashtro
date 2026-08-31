import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { categoryKeys } from "@ts/api/categories";
import { ManageFoldersModal } from "@ts/components/dialogs/ManageFoldersModal";

vi.mock("@ts/utils/auth", () => ({ authFetch: vi.fn() }));
import { authFetch } from "@ts/utils/auth";
const mockedAuthFetch = vi.mocked(authFetch);

const projectId = "proj-1";

const categoriesResponse = {
  categories: [{ id: "cat-1", name: "Blog" }],
  category_map: { Article: "cat-1" },
};

const seedCategories = (queryClient: ReturnType<typeof createTestQueryClient>) =>
  queryClient.setQueryData(categoryKeys.byProject(projectId), categoriesResponse);

beforeEach(() => {
  mockedAuthFetch.mockReset();
  // React Query refetches on mount (staleTime: 0) even when the cache is
  // seeded directly, so GET must echo the same seeded data back or a
  // background refetch silently clobbers it mid-test.
  mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      return { ok: true, json: async () => categoriesResponse } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
});

describe("ManageFoldersModal", () => {
  it("shows General and existing folders with their schema counts", () => {
    const queryClient = createTestQueryClient();
    seedCategories(queryClient);

    render(
      <ManageFoldersModal projectId={projectId} open onClose={vi.fn()} schemaNames={["Article", "Author"]} />,
      { wrapper: withQueryClient(queryClient) }
    );

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Blog")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2); // Blog has 1 schema, General has 1 schema
  });

  it("creates a new folder and clears the input", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    seedCategories(queryClient);

    render(
      <ManageFoldersModal projectId={projectId} open onClose={vi.fn()} />,
      { wrapper: withQueryClient(queryClient) }
    );

    const input = screen.getByPlaceholderText("New folder name");
    await user.type(input, "News");
    await user.click(screen.getByRole("button", { name: /Add/ }));

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema-categories/`),
      expect.objectContaining({ method: "POST" })
    ));
    expect(input).toHaveValue("");
  });

  it("deletes a folder after the confirm step (delete then confirm, not a single click)", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    seedCategories(queryClient);

    render(
      <ManageFoldersModal projectId={projectId} open onClose={vi.fn()} />,
      { wrapper: withQueryClient(queryClient) }
    );

    const row = screen.getByText("Blog").closest("tr") as HTMLElement;
    const [, deleteBtn] = row.querySelectorAll("button");

    // First click only arms the confirm state; the delete request shouldn't fire yet.
    await user.click(deleteBtn);
    expect(mockedAuthFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/schema-categories/cat-1/"),
      expect.anything()
    );

    const confirmBtn = row.querySelectorAll("button")[0];
    await user.click(confirmBtn);

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/schema-categories/cat-1/"),
      expect.objectContaining({ method: "DELETE" })
    ));
  });
});
