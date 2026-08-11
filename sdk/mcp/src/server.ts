/**
 * DashTro CMS — MCP Server (Node/TS port of cms_mcp/server.py)
 *
 * Exposes the CMS REST API as MCP tools so Claude (or any MCP client) can
 * read and write content directly. A pure HTTP client against CMS_API_URL —
 * no local access to a Dashtro instance's database is required, so this can
 * run anywhere and just point at a deployed (e.g. Docker) instance.
 *
 * Configuration (env vars):
 *   CMS_API_URL — base URL of the CMS backend, e.g. https://admin.example.com/api/cms
 *   CMS_TOKEN   — Bearer token for authenticated requests (omit in DEBUG mode)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const CMS_API_URL = process.env.CMS_API_URL ?? "http://localhost:7312/api/cms";
const CMS_TOKEN = process.env.CMS_TOKEN ?? "";

// ── HTTP helpers ────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CMS_TOKEN) h.Authorization = `Bearer ${CMS_TOKEN}`;
  return h;
}

function apiUrl(path: string, params?: Record<string, string | number>): string {
  const u = new URL(`${CMS_API_URL.replace(/\/$/, "")}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

async function request(method: string, path: string, options?: {
  params?: Record<string, string | number>;
  data?: unknown;
}): Promise<unknown> {
  const res = await fetch(apiUrl(path, options?.params), {
    method,
    headers: headers(),
    body: options?.data !== undefined ? JSON.stringify(options.data) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (method === "DELETE") return null;
  return res.json();
}

const get = (path: string, params?: Record<string, string | number>) =>
  request("GET", path, { params });
const post = (path: string, data?: unknown) => request("POST", path, { data: data ?? {} });
const put = (path: string, data: unknown) => request("PUT", path, { data });
const patch = (path: string, data: unknown) => request("PATCH", path, { data });
const del = (path: string) => request("DELETE", path);

function dump(obj: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

// ── Server ──────────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({ name: "DashTro CMS", version: "0.1.0" });

  // Projects

  server.registerTool(
    "list_projects",
    { description: "List all CMS projects." },
    async () => dump(await get("/projects/")),
  );

  server.registerTool(
    "list_workspaces",
    {
      description: "List all workspaces for a project, including which one is production.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => dump(await get(`/projects/${project_id}/workspaces/`)),
  );

  server.registerTool(
    "push_workspace_to_production",
    {
      description:
        "Push a workspace's content to the production workspace. Irreversible — use with care.",
      inputSchema: { project_id: z.string(), workspace_name: z.string() },
    },
    async ({ project_id, workspace_name }) =>
      dump(
        await post(`/projects/${project_id}/workspaces/${workspace_name}/push-to-prod/`),
      ),
  );

  // Schema

  server.registerTool(
    "list_schema",
    {
      description: "List all schema names defined in a project.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const data = (await get(`/projects/${project_id}/schema/`)) as Record<string, unknown>;
      return dump({ schema_names: data._schema_names ?? [] });
    },
  );

  server.registerTool(
    "get_schema",
    {
      description: "Get the field definitions for a named schema, including field types and defaults.",
      inputSchema: { project_id: z.string(), schema_name: z.string() },
    },
    async ({ project_id, schema_name }) =>
      dump(await get(`/projects/${project_id}/schema/${schema_name}/`)),
  );

  // Collections

  server.registerTool(
    "list_collections",
    {
      description: "List all collections in a project with their schema associations.",
      inputSchema: { project_id: z.string() },
    },
    async ({ project_id }) => {
      const data = (await get(`/projects/${project_id}/collections/`)) as Record<string, unknown>;
      return dump(data._schema_collections ?? []);
    },
  );

  // Documents

  server.registerTool(
    "list_documents",
    {
      description:
        "List all documents in a collection. Returns document IDs, their display labels, and publish statuses (draft/published).",
      inputSchema: { project_id: z.string(), workspace_name: z.string(), collection_name: z.string() },
    },
    async ({ project_id, workspace_name, collection_name }) => {
      const data = (await get(
        `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/`,
      )) as Record<string, unknown>;
      return dump({
        schema_name: data._schema_name,
        document_ids: data._document_ids ?? [],
        document_labels: data._document_labels ?? {},
        document_statuses: data._document_statuses ?? {},
      });
    },
  );

  server.registerTool(
    "get_document",
    {
      description:
        "Fetch a single document with referenced documents inlined. depth controls how many levels of ReferenceDocument fields are resolved (default 3).",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        depth: z.number().int().default(3),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, depth }) =>
      dump(
        await get(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
          { depth },
        ),
      ),
  );

  server.registerTool(
    "create_document",
    {
      description:
        "Create a new document in a collection. data keys must match the collection's schema field names. New documents default to _status='draft'. Production workspace is read-only.",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ project_id, workspace_name, collection_name, data }) =>
      dump(
        await post(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/`,
          data,
        ),
      ),
  );

  server.registerTool(
    "update_document",
    {
      description:
        "Update fields on an existing document. Only include keys you want to change. The previous state is automatically saved as a version before the update is applied. Production workspace is read-only.",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, data }) =>
      dump(
        await put(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
          data,
        ),
      ),
  );

  server.registerTool(
    "update_document_status",
    {
      description:
        "Change a document's publish status. status must be 'draft' or 'published'. Production workspace is read-only.",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        status: z.enum(["draft", "published"]),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, status }) =>
      dump(
        await patch(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/status/`,
          { _status: status },
        ),
      ),
  );

  server.registerTool(
    "delete_document",
    {
      description: "Permanently delete a document from a collection. Production workspace is read-only.",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id }) => {
      await del(
        `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
      );
      return dump({ deleted: document_id });
    },
  );

  // Document versions

  server.registerTool(
    "list_document_versions",
    {
      description: "List all saved versions of a document (created automatically on each update).",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id }) =>
      dump(
        await get(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/versions/`,
        ),
      ),
  );

  server.registerTool(
    "restore_document_version",
    {
      description:
        "Restore a document to a previous version. The current state is saved as a new version before the restore so nothing is permanently lost.",
      inputSchema: {
        project_id: z.string(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        version_id: z.string(),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, version_id }) =>
      dump(
        await post(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/versions/${version_id}/restore/`,
        ),
      ),
  );

  // Realtime Database

  server.registerTool(
    "rtdb_get",
    {
      description:
        "Read a node (or the whole tree if path is empty) from a project's Realtime Database. path is a '/'-delimited key path, e.g. 'settings/homepage'.",
      inputSchema: { project_id: z.string(), path: z.string().default("") },
    },
    async ({ project_id, path }) => dump(await get(`/projects/${project_id}/rtdb/${path}`)),
  );

  server.registerTool(
    "rtdb_set",
    {
      description:
        "Overwrite the node at path with value (any JSON-serializable data). An empty path targets the tree root.",
      inputSchema: { project_id: z.string(), path: z.string(), value: z.unknown() },
    },
    async ({ project_id, path, value }) =>
      dump(await put(`/projects/${project_id}/rtdb/${path}`, value)),
  );

  server.registerTool(
    "rtdb_update",
    {
      description: "Shallow-merge value (a JSON object) into the existing node at path.",
      inputSchema: { project_id: z.string(), path: z.string(), value: z.record(z.string(), z.unknown()) },
    },
    async ({ project_id, path, value }) =>
      dump(await patch(`/projects/${project_id}/rtdb/${path}`, value)),
  );

  server.registerTool(
    "rtdb_delete",
    {
      description: "Delete the node at path (or the entire tree if path is empty). Irreversible.",
      inputSchema: { project_id: z.string(), path: z.string().default("") },
    },
    async ({ project_id, path }) => {
      await del(`/projects/${project_id}/rtdb/${path}`);
      return dump({ deleted: path || "/" });
    },
  );

  return server;
}
