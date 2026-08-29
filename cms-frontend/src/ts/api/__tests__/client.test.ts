/**
 * Unit tests for apiRequest — the thin fetch wrapper every TanStack Query
 * hook builds on. Covers URL/header construction, JSON parsing, the
 * parseJson:false opt-out (needed for bodyless responses like DELETE), and
 * error handling on non-ok responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { API_BASE_URL } from "@ts/config";
import { apiRequest } from "@ts/api/client";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);

beforeEach(() => {
  mockedAuthFetch.mockReset();
});

describe("apiRequest", () => {
  it("builds the full URL from API_BASE_URL and the given path", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await apiRequest("/projects/");

    expect(mockedAuthFetch).toHaveBeenCalledWith(`${API_BASE_URL}/projects/`, expect.anything());
  });

  it("defaults to a JSON Content-Type header, unless the caller overrides it", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await apiRequest("/projects/");
    await apiRequest("/projects/", { headers: { "Content-Type": "text/plain" } });

    expect(mockedAuthFetch).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ headers: { "Content-Type": "application/json" } })
    );
    expect(mockedAuthFetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ headers: { "Content-Type": "text/plain" } })
    );
  });

  it("passes through method and body untouched", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await apiRequest("/projects/", { method: "POST", body: JSON.stringify({ name: "New" }) });

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New" }) })
    );
  });

  it("parses and returns the JSON body by default", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ _id: "1" }) } as Response);

    const result = await apiRequest<{ _id: string }>("/projects/1/");

    expect(result).toEqual({ _id: "1" });
  });

  it("skips JSON parsing entirely when parseJson is false", async () => {
    // No `json` method on the mock: proves apiRequest never calls it here.
    mockedAuthFetch.mockResolvedValue({ ok: true } as Response);

    const result = await apiRequest("/projects/1/", { method: "DELETE", parseJson: false });

    expect(result).toBeUndefined();
  });

  it("throws a generic error when the response is not ok and has no JSON body", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(apiRequest("/projects/missing/")).rejects.toThrow(
      "Request failed: 404 /projects/missing/"
    );
  });

  it("throws the backend's string detail message when the error body has one", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "workspace name already exists" }),
    } as Response);

    await expect(apiRequest("/workspaces/")).rejects.toThrow("workspace name already exists");
  });

  it("joins pydantic validation errors from an array detail into one message", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ msg: "field required" }, { msg: "too long" }] }),
    } as Response);

    await expect(apiRequest("/workspaces/")).rejects.toThrow("field required too long");
  });

  it("falls back to the generic message when the error body has no usable detail", async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ some: "unrelated shape" }),
    } as Response);

    await expect(apiRequest("/workspaces/")).rejects.toThrow("Request failed: 500 /workspaces/");
  });
});
