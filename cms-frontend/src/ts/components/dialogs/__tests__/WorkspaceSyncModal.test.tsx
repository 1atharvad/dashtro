import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { WorkspaceSyncModal } from "@ts/components/dialogs/WorkspaceSyncModal";

vi.mock("@ts/utils/auth", () => ({ authFetch: vi.fn() }));
import { authFetch } from "@ts/utils/auth";
const mockedAuthFetch = vi.mocked(authFetch);

const projectId = "proj-1";

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("WorkspaceSyncModal — workspace-level (unscoped)", () => {
  it("shows the no-differences message when the diff is empty", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    render(
      <WorkspaceSyncModal projectId={projectId} open workspaceName="staging" mode="push" onClose={vi.fn()} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(await screen.findByText(/already in sync/)).toBeInTheDocument();
  });

  it("pushes to production and shows a success toast on confirm", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedAuthFetch.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/diff-vs-production/")) {
        return {
          ok: true,
          json: async () => ({ posts: { source_only: [{ document_id: "d1" }], target_only: [], modified: [] } }),
        } as Response;
      }
      if (url.includes("/push-to-prod/")) return { ok: true, json: async () => ({}) } as Response;
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });

    render(
      <WorkspaceSyncModal projectId={projectId} open workspaceName="staging" mode="push" onClose={onClose} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(await screen.findByText("d1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Push to production" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pushed to production"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an error toast and does not close when the push fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedAuthFetch.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/diff-vs-production/")) {
        return {
          ok: true,
          json: async () => ({ posts: { source_only: [{ document_id: "d1" }], target_only: [], modified: [] } }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    render(
      <WorkspaceSyncModal projectId={projectId} open workspaceName="staging" mode="push" onClose={onClose} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await screen.findByText("d1");
    await user.click(screen.getByRole("button", { name: "Push to production" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to push to production"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets the user resolve a pull conflict by picking a side", async () => {
    const user = userEvent.setup();
    mockedAuthFetch.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/diff-vs-production/")) {
        return {
          ok: true,
          json: async () => ({
            posts: { source_only: [], target_only: [], modified: [{ document_id: "d1", changed_fields: ["title"] }] },
          }),
        } as Response;
      }
      if (url.includes("/pull-from-production/")) {
        return {
          ok: true,
          json: async () => {
            const body = JSON.parse(String(init?.body));
            expect(body.resolutions).toEqual({ "posts:d1": "workspace" });
            return {};
          },
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(
      <WorkspaceSyncModal projectId={projectId} open workspaceName="staging" mode="pull" onClose={vi.fn()} />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await screen.findByText("d1");
    // Defaults to "production" for conflicts; switch this one to "Keep mine".
    await user.click(screen.getByRole("button", { name: "Keep mine" }));
    await user.click(screen.getByRole("button", { name: "Pull from production" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pulled latest from production"));
  });
});

describe("WorkspaceSyncModal — collection-scoped", () => {
  it("delegates to onPush instead of the workspace-level push, and doesn't toast itself", async () => {
    const user = userEvent.setup();
    const onPush = vi.fn().mockResolvedValue(undefined);
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ posts: { source_only: [{ document_id: "d1" }], target_only: [], modified: [] } }),
    } as Response);

    render(
      <WorkspaceSyncModal
        projectId={projectId}
        open
        workspaceName="staging"
        mode="push"
        onClose={vi.fn()}
        collectionId="posts"
        collectionName="posts"
        onPush={onPush}
      />,
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await screen.findByText("d1");
    await user.click(screen.getByRole("button", { name: "Push to production" }));

    await waitFor(() => expect(onPush).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
