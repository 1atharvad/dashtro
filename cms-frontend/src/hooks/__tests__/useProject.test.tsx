/**
 * Integration test for useProjectData: a real Redux store (just the
 * `projects` reducer) wrapped around `renderHook`, with `authFetch` mocked
 * so no real network call happens. Verifies the hook's dispatch wiring and
 * its mount-time fetch guard, without needing to mock the whole
 * fetch/Response cycle for every branch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import projectReducer from "@/redux/projectSlice";
import { useProjectData } from "./useProject";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);

type Project = { _id: string; name: string; description: string; created_at: string; updated_at: string };

const makeStore = (preloadedState?: { projects: Project[]; loading: boolean; error: string | null }) =>
  configureStore({
    reducer: { projects: projectReducer },
    preloadedState: preloadedState && { projects: preloadedState },
  });

const wrapper = (store: ReturnType<typeof makeStore>) =>
  ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

beforeEach(() => {
  mockedAuthFetch.mockReset();
});

describe("useProjectData", () => {
  it("fetches projects once on mount when the store starts empty", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const store = makeStore();

    renderHook(() => useProjectData(), { wrapper: wrapper(store) });

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1));
  });

  it("does not re-fetch when projects are already loaded", () => {
    const store = makeStore({
      projects: [{ _id: "1", name: "Existing", description: "", created_at: "", updated_at: "" }],
      loading: false,
      error: null,
    });

    renderHook(() => useProjectData(), { wrapper: wrapper(store) });

    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });

  it("addProject posts the new project's name and description", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _id: "new-id", name: "New", description: "desc" }),
    } as Response);
    const store = makeStore({ projects: [], loading: false, error: null });

    const { result } = renderHook(() => useProjectData(), { wrapper: wrapper(store) });
    await result.current.addProject("New", "desc");

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New", description: "desc" }),
      })
    );
  });
});
