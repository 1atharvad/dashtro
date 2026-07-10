/**
 * Reducer tests for documentSlice.
 *
 * These dispatch plain fulfilled/rejected actions straight at the reducer
 * export — no store, no fetch mocking — because the pure state-transition
 * logic lives entirely in `extraReducers`, decoupled from the `authFetch`
 * side effect inside each thunk.
 */
import { describe, it, expect } from "vitest";
import reducer, {
  fetchDocument,
  fetchCollection,
  createDocument,
  deleteDocument,
} from "./documentSlice";
import type { DocumentData } from "@ts/types/constants";

const initialState = {
  byProject: {},
  versions: {},
  loading: true,
  error: null as string | null,
};

describe("documentSlice", () => {
  it("fetchDocument.fulfilled stores the document under its project/collection", () => {
    const action = {
      type: fetchDocument.fulfilled.type,
      payload: {
        projectId: "proj-1",
        collectionName: "posts",
        documentId: "doc-1",
        data: { title: "Hello" } as DocumentData,
      },
    };
    const state = reducer(initialState, action);
    expect(state.byProject["proj-1"].content["posts"]["doc-1"]).toEqual({ title: "Hello" });
    expect(state.loading).toBe(false);
  });

  it("fetchDocument.fulfilled merges into existing document data instead of replacing it", () => {
    const seeded = {
      ...initialState,
      byProject: {
        "proj-1": {
          content: { posts: { "doc-1": { title: "Old title", body: "Keep me" } as DocumentData } },
          ids: {},
        },
      },
    };
    const action = {
      type: fetchDocument.fulfilled.type,
      payload: {
        projectId: "proj-1",
        collectionName: "posts",
        documentId: "doc-1",
        data: { title: "New title" } as DocumentData,
      },
    };
    const state = reducer(seeded, action);
    expect(state.byProject["proj-1"].content["posts"]["doc-1"]).toEqual({
      title: "New title",
      body: "Keep me",
    });
  });

  it("fetchCollection.rejected records the thunk's error message", () => {
    const action = { type: fetchCollection.rejected.type, error: { message: "boom" } };
    const state = reducer(initialState, action);
    expect(state.error).toBe("boom");
    expect(state.loading).toBe(false);
  });

  it("createDocument.fulfilled adds the new document to content and ids", () => {
    const action = {
      type: createDocument.fulfilled.type,
      payload: {
        projectId: "proj-1",
        collectionName: "posts",
        data: { _id: "doc-2", title: "New post", _status: "draft" } as DocumentData,
      },
    };
    const state = reducer(initialState, action);
    expect(state.byProject["proj-1"].content["posts"]["doc-2"]).toEqual({
      title: "New post",
      _status: "draft",
    });
    expect(state.byProject["proj-1"].ids["posts"]._document_ids).toContain("doc-2");
    expect(state.byProject["proj-1"].ids["posts"]._document_statuses["doc-2"]).toBe("draft");
  });

  // Regression test for a fixed bug: deleteDocument.fulfilled used to access
  // `proj.ids[collectionName]._document_ids` without a guard, so it crashed
  // when a document was loaded via fetchDocument directly (so `proj` exists)
  // but `fetchCollection` was never called for this collection (so
  // `proj.ids[collectionName]` was still undefined). It's now a no-op in
  // that case instead of throwing.
  it("deleteDocument.fulfilled is a no-op when proj.ids[collectionName] is undefined", () => {
    const seeded = {
      ...initialState,
      byProject: {
        "proj-1": { content: {}, ids: {} },
      },
    };
    const action = {
      type: deleteDocument.fulfilled.type,
      payload: { projectId: "proj-1", collectionName: "posts", documentId: "doc-1" },
    };
    let state: ReturnType<typeof reducer> = seeded;
    expect(() => { state = reducer(seeded, action); }).not.toThrow();
    expect(state.byProject["proj-1"].ids).toEqual({});
  });
});
