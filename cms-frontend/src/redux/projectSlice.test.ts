/**
 * Reducer tests for projectSlice — a second, simpler example of dispatching
 * plain fulfilled/rejected actions directly at the reducer, without a store
 * or fetch mocking.
 */
import { describe, it, expect } from "vitest";
import reducer, {
  fetchProjects,
  createProject,
  deleteProject,
} from "./projectSlice";

const initialState = {
  projects: [],
  loading: true,
  error: null as string | null,
};

const project = (id: string) => ({
  _id: id,
  name: `Project ${id}`,
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("projectSlice", () => {
  it("fetchProjects.fulfilled replaces the project list and clears loading", () => {
    const action = { type: fetchProjects.fulfilled.type, payload: [project("1"), project("2")] };
    const state = reducer(initialState, action);
    expect(state.projects).toHaveLength(2);
    expect(state.loading).toBe(false);
  });

  it("createProject.fulfilled appends the new project", () => {
    const seeded = { ...initialState, projects: [project("1")] };
    const action = { type: createProject.fulfilled.type, payload: project("2") };
    const state = reducer(seeded, action);
    expect(state.projects.map((p) => p._id)).toEqual(["1", "2"]);
  });

  it("deleteProject.fulfilled removes the project by id", () => {
    const seeded = { ...initialState, projects: [project("1"), project("2")] };
    const action = { type: deleteProject.fulfilled.type, payload: { _id: "1" } };
    const state = reducer(seeded, action);
    expect(state.projects.map((p) => p._id)).toEqual(["2"]);
  });

  it("fetchProjects.rejected records the error and clears loading", () => {
    const action = { type: fetchProjects.rejected.type, error: { message: "network down" } };
    const state = reducer(initialState, action);
    expect(state.error).toBe("network down");
    expect(state.loading).toBe(false);
  });
});
