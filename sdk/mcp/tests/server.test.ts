/**
 * Integration tests for src/server.ts's MCP tools.
 *
 * Tools are called through the real MCP protocol — an InMemoryTransport
 * linked pair between the server (`createServer()`) and an SDK `Client` —
 * rather than by reaching into server internals. `fetch` is stubbed with a
 * tiny route table standing in for the CMS backend's /api/sdk/* surface, so
 * each test verifies both what request a tool sends (method, path, body,
 * X-API-Key header) and how it turns the response back into the MCP tool
 * result.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServer as CreateServer } from "../src/server.js";

// CMS_API_KEY is read into a module-level const at import time, so the env
// var has to be set *before* the module is first (dynamically) imported —
// a static top-level import would already be evaluated by the time
// beforeEach runs and permanently miss the value.
let createServer: typeof CreateServer;

type Call = { method: string; path: string; body: unknown; apiKey: string | null };
type Handler = (url: URL, body: unknown) => unknown;

function stubFetch(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      const apiKey = (init?.headers as Record<string, string> | undefined)?.["X-API-Key"] ?? null;
      calls.push({ method, path: url.pathname + url.search, body, apiKey });

      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) {
        return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
      }
      const result = handler(url, body);
      if (result instanceof Response) return result;
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify(result ?? {}), { status: 200 });
    }),
  );
  return calls;
}

async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => client.close() };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

describe("createServer tools", () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.CMS_API_KEY = "test-api-key";
    ({ createServer } = await import("../src/server.js"));
    ({ client, close } = await connectedClient());
  });

  afterEach(async () => {
    await close();
    vi.unstubAllGlobals();
    delete process.env.CMS_API_KEY;
  });

  it("list_schema unwraps _schema_names and sends X-API-Key, not a bearer token", async () => {
    const calls = stubFetch({
      "GET /api/sdk/projects/p1/schema/": () => ({ _schema_names: ["Post", "Author"] }),
    });

    const result = await client.callTool({ name: "list_schema", arguments: { project_id: "p1" } });

    expect(calls[0].path).toBe("/api/sdk/projects/p1/schema/");
    expect(JSON.parse(textOf(result))).toEqual({ schema_names: ["Post", "Author"] });
  });

  it("get_schema GETs the named schema", async () => {
    const calls = stubFetch({
      "GET /api/sdk/projects/p1/schema/Post/": () => ({ Post: [{ _name: "title" }] }),
    });

    const result = await client.callTool({
      name: "get_schema",
      arguments: { project_id: "p1", schema_name: "Post" },
    });

    expect(calls[0].path).toBe("/api/sdk/projects/p1/schema/Post/");
    expect(JSON.parse(textOf(result))).toEqual({ Post: [{ _name: "title" }] });
  });

  it("list_collections unwraps _schema_collections", async () => {
    stubFetch({
      "GET /api/sdk/projects/p1/collections/": () => ({
        _schema_collections: [{ _collection_name: "posts", _schema_name: "Post" }],
      }),
    });

    const result = await client.callTool({
      name: "list_collections",
      arguments: { project_id: "p1" },
    });

    expect(JSON.parse(textOf(result))).toEqual([
      { _collection_name: "posts", _schema_name: "Post" },
    ]);
  });

  it("list_documents shapes ids/labels/statuses from the collection response", async () => {
    stubFetch({
      "GET /api/sdk/projects/p1/workspace/staging/collection/posts/": () => ({
        _schema_name: "Post",
        _document_ids: ["d1"],
        _document_labels: { d1: "Hello" },
        _document_statuses: { d1: "draft" },
      }),
    });

    const result = await client.callTool({
      name: "list_documents",
      arguments: { project_id: "p1", workspace_name: "staging", collection_name: "posts" },
    });

    expect(JSON.parse(textOf(result))).toEqual({
      schema_name: "Post",
      document_ids: ["d1"],
      document_labels: { d1: "Hello" },
      document_statuses: { d1: "draft" },
    });
  });

  it("get_document sends the API key and passes depth as a query param", async () => {
    const calls = stubFetch({
      "GET /api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/": () => ({
        title: "Hello",
      }),
    });

    await client.callTool({
      name: "get_document",
      arguments: {
        project_id: "p1",
        workspace_name: "staging",
        collection_name: "posts",
        document_id: "d1",
        depth: 2,
      },
    });

    expect(calls[0].path).toBe(
      "/api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/?depth=2",
    );
    expect(calls[0].apiKey).toBe("test-api-key");
  });

  it("create_document POSTs the data payload", async () => {
    const calls = stubFetch({
      "POST /api/sdk/projects/p1/workspace/staging/collection/posts/": () => ({
        _id: "d1",
        title: "Hello",
        _status: "draft",
      }),
    });

    const result = await client.callTool({
      name: "create_document",
      arguments: {
        project_id: "p1",
        workspace_name: "staging",
        collection_name: "posts",
        data: { title: "Hello" },
      },
    });

    expect(calls[0].body).toEqual({ title: "Hello" });
    expect(JSON.parse(textOf(result))._id).toBe("d1");
  });

  it("update_document PUTs the data payload", async () => {
    const calls = stubFetch({
      "PUT /api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/": () => ({
        _id: "d1",
        title: "Updated",
      }),
    });

    await client.callTool({
      name: "update_document",
      arguments: {
        project_id: "p1",
        workspace_name: "staging",
        collection_name: "posts",
        document_id: "d1",
        data: { title: "Updated" },
      },
    });

    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/",
      body: { title: "Updated" },
    });
  });

  it("update_document_status PATCHes the dedicated status/ endpoint", async () => {
    const calls = stubFetch({
      "PATCH /api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/status/": () => ({
        _id: "d1",
        _status: "published",
      }),
    });

    const result = await client.callTool({
      name: "update_document_status",
      arguments: {
        project_id: "p1",
        workspace_name: "staging",
        collection_name: "posts",
        document_id: "d1",
        status: "published",
      },
    });

    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/status/",
      body: { _status: "published" },
    });
    expect(JSON.parse(textOf(result))._status).toBe("published");
  });

  it("delete_document DELETEs and reports the deleted id", async () => {
    const calls = stubFetch({
      "DELETE /api/sdk/projects/p1/workspace/staging/collection/posts/document/d1/": () => undefined,
    });

    const result = await client.callTool({
      name: "delete_document",
      arguments: {
        project_id: "p1",
        workspace_name: "staging",
        collection_name: "posts",
        document_id: "d1",
      },
    });

    expect(calls[0].method).toBe("DELETE");
    expect(JSON.parse(textOf(result))).toEqual({ deleted: "d1" });
  });

  it("rtdb_get/rtdb_set/rtdb_update/rtdb_delete hit /api/sdk/*/rtdb/* with the right methods", async () => {
    const calls = stubFetch({
      "GET /api/sdk/projects/p1/rtdb/settings/homepage": () => ({ title: "Home" }),
      "PUT /api/sdk/projects/p1/rtdb/settings/homepage": (_u, body) => body,
      "PATCH /api/sdk/projects/p1/rtdb/settings/homepage": (_u, body) => body,
      "DELETE /api/sdk/projects/p1/rtdb/settings/homepage": () => undefined,
    });

    await client.callTool({
      name: "rtdb_get",
      arguments: { project_id: "p1", path: "settings/homepage" },
    });
    await client.callTool({
      name: "rtdb_set",
      arguments: { project_id: "p1", path: "settings/homepage", value: { title: "Home" } },
    });
    await client.callTool({
      name: "rtdb_update",
      arguments: { project_id: "p1", path: "settings/homepage", value: { subtitle: "Hi" } },
    });
    const deleteResult = await client.callTool({
      name: "rtdb_delete",
      arguments: { project_id: "p1", path: "settings/homepage" },
    });

    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "PATCH", "DELETE"]);
    expect(calls.every((c) => c.apiKey === "test-api-key")).toBe(true);
    expect(JSON.parse(textOf(deleteResult))).toEqual({ deleted: "settings/homepage" });
  });

  it("surfaces a non-ok HTTP response (e.g. a rejected API key) as a tool error", async () => {
    stubFetch({
      "GET /api/sdk/projects/p1/schema/": () =>
        new Response(JSON.stringify({ detail: "Invalid or revoked API key" }), { status: 401 }),
    });

    const result = await client.callTool({ name: "list_schema", arguments: { project_id: "p1" } });

    expect(result.isError).toBe(true);
  });
});
