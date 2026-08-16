/**
 * DashTro CMS — MCP Server (Node/TS port of cms_mcp/server.py)
 *
 * Exposes the CMS SDK REST API (/api/sdk/*) as MCP tools so Claude (or any
 * MCP client) can read and write project content directly. Uses API-key
 * auth only (X-API-Key) — never a user's JWT — so what an MCP client can do
 * is exactly what the configured API key is scoped to (project/collections/
 * read-write). A pure HTTP client against CMS_API_URL — no local access to
 * a Dashtro instance's database is required, so this can run anywhere and
 * just point at a deployed (e.g. Docker) instance.
 *
 * That also means tools with no API-key-authorized equivalent aren't
 * exposed here: listing all projects, listing/renaming individual schema
 * fields, push-to-production, and document version history are all admin
 * (JWT-only) operations on the /api/cms/* surface.
 *
 * Configuration (env vars):
 *   CMS_API_URL — base URL of the CMS backend's SDK API, e.g.
 *                 https://admin.example.com/api/sdk
 *   CMS_API_KEY — API key for authenticated requests, scoped per collection
 *                 (read/write) from the CMS's settings page
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const CMS_API_URL = process.env.CMS_API_URL ?? "http://localhost:7312/api/sdk";
const CMS_API_KEY = process.env.CMS_API_KEY ?? "";
const CMS_PROJECT_ID = process.env.CMS_PROJECT_ID ?? "";

/** Resolve project_id: explicit arg > env var > throw. */
function resolveProjectId(explicit?: string): string {
  const id = explicit ?? CMS_PROJECT_ID;
  if (!id) throw new Error("project_id is required (provide as argument or set CMS_PROJECT_ID env var)");
  return id;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

/** JSON content-type header, plus X-API-Key if CMS_API_KEY is set. */
function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CMS_API_KEY) h["X-API-Key"] = CMS_API_KEY;
  return h;
}

/** Join CMS_API_URL and path (plus optional query params) into a full request URL. */
function apiUrl(path: string, params?: Record<string, string | number>): string {
  const u = new URL(`${CMS_API_URL.replace(/\/$/, "")}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

/** Send an HTTP request and return the parsed JSON body, throwing on a non-ok response. */
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

/** Serialize obj to pretty-printed JSON for a tool's text response. */
function dump(obj: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

// ── Server ──────────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({ name: "DashTro CMS", version: "0.1.0" });

  // Projects

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new project, complete with its \"production\" workspace. Only works with an unscoped API key (one not already bound to a single project) — a key locked to one project can't create another.",
      inputSchema: { name: z.string(), description: z.string().default("") },
    },
    async ({ name, description }) => dump(await post("/projects/", { name, description })),
  );

  server.registerTool(
    "update_project",
    {
      description: "Rename a project or change its description.",
      inputSchema: { project_id: z.string().optional(), name: z.string(), description: z.string().default("") },
    },
    async ({ project_id, name, description }) =>
      dump(await put(`/projects/${resolveProjectId(project_id)}/`, { name, description })),
  );

  server.registerTool(
    "delete_project",
    {
      description:
        "Permanently delete a project, including every workspace, schema field, collection, and document in it. Irreversible.",
      inputSchema: { project_id: z.string().optional() },
    },
    async ({ project_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/`);
      return dump({ deleted: pid });
    },
  );

  // Workspaces

  server.registerTool(
    "create_workspace",
    {
      description:
        "Create a non-production workspace to write draft content into. A project's auto-created \"production\" workspace is read-only for direct document writes, so a workspace created here is where create_document and update_document actually need to target.",
      inputSchema: { project_id: z.string().optional(), workspace_name: z.string() },
    },
    async ({ project_id, workspace_name }) =>
      dump(await post(`/projects/${resolveProjectId(project_id)}/workspaces/`, { workspace_name })),
  );

  // Schema

  server.registerTool(
    "list_schema",
    {
      description: "List all schema names defined in a project.",
      inputSchema: { project_id: z.string().optional() },
    },
    async ({ project_id }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(`/projects/${pid}/schema/`)) as Record<string, unknown>;
      return dump({ schema_names: data._schema_names ?? [] });
    },
  );

  server.registerTool(
    "get_schema",
    {
      description: "Get the field definitions for a named schema, including field types and defaults.",
      inputSchema: { project_id: z.string().optional(), schema_name: z.string() },
    },
    async ({ project_id, schema_name }) =>
      dump(await get(`/projects/${resolveProjectId(project_id)}/schema/${schema_name}/`)),
  );

  server.registerTool(
    "create_schema_field",
    {
      description:
        "Add a field to a schema (creating the schema itself the first time a field references it). field_type is e.g. 'String', 'Number', 'Boolean', 'RichText', 'ReferenceDocument'. Set display_name=true to make this field the one shown as a document's label in lists.",
      inputSchema: {
        project_id: z.string().optional(),
        schema_name: z.string(),
        field_name: z.string(),
        field_type: z.string(),
        index: z.number().int().default(1),
        display_name: z.boolean().default(false),
      },
    },
    async ({ project_id, schema_name, field_name, field_type, index, display_name }) =>
      dump(
        await post(`/projects/${resolveProjectId(project_id)}/schema/`, {
          _index: index,
          _name: field_name,
          _type: field_type,
          _schema_name: schema_name,
          _display_name: display_name,
        }),
      ),
  );

  server.registerTool(
    "delete_schema_field",
    {
      description: "Delete a schema field by its id (from create_schema_field's response or get_schema).",
      inputSchema: { project_id: z.string().optional(), field_id: z.string() },
    },
    async ({ project_id, field_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/schema/${field_id}/`);
      return dump({ deleted: field_id });
    },
  );

  // Collections

  server.registerTool(
    "list_collections",
    {
      description: "List all collections in a project with their schema associations.",
      inputSchema: { project_id: z.string().optional() },
    },
    async ({ project_id }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(`/projects/${pid}/collections/`)) as Record<string, unknown>;
      return dump(data._schema_collections ?? []);
    },
  );

  server.registerTool(
    "create_collection",
    {
      description:
        "Create a collection backed by an existing schema (create its fields with create_schema_field first). Documents are then written into this collection via create_document.",
      inputSchema: { project_id: z.string().optional(), collection_name: z.string(), schema_name: z.string() },
    },
    async ({ project_id, collection_name, schema_name }) =>
      dump(
        await post(`/projects/${resolveProjectId(project_id)}/collections/`, {
          _index: 1,
          _collection_name: collection_name,
          _schema_name: schema_name,
        }),
      ),
  );

  server.registerTool(
    "delete_collection",
    {
      description: "Permanently delete a collection and its documents across every workspace. Irreversible.",
      inputSchema: { project_id: z.string().optional(), collection_id: z.string() },
    },
    async ({ project_id, collection_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/collections/${collection_id}/`);
      return dump({ deleted: collection_id });
    },
  );

  // Documents

  server.registerTool(
    "list_documents",
    {
      description:
        "List all documents in a collection. Returns document IDs, their display labels, and publish statuses (draft/published).",
      inputSchema: { project_id: z.string().optional(), workspace_name: z.string(), collection_name: z.string() },
    },
    async ({ project_id, workspace_name, collection_name }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(
        `/projects/${pid}/workspace/${workspace_name}/collection/${collection_name}/`,
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
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        depth: z.number().int().default(3),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, depth }) =>
      dump(
        await get(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
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
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ project_id, workspace_name, collection_name, data }) =>
      dump(
        await post(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/`,
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
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, data }) =>
      dump(
        await put(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
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
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        status: z.enum(["draft", "published"]),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id, status }) =>
      dump(
        await patch(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/status/`,
          { _status: status },
        ),
      ),
  );

  server.registerTool(
    "delete_document",
    {
      description: "Permanently delete a document from a collection. Production workspace is read-only.",
      inputSchema: {
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
      },
    },
    async ({ project_id, workspace_name, collection_name, document_id }) => {
      const pid = resolveProjectId(project_id);
      await del(
        `/projects/${pid}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
      );
      return dump({ deleted: document_id });
    },
  );

  // Realtime Database

  server.registerTool(
    "rtdb_get",
    {
      description:
        "Read a node (or the whole tree if path is empty) from a project's Realtime Database. path is a '/'-delimited key path, e.g. 'settings/homepage'.",
      inputSchema: { project_id: z.string().optional(), path: z.string().default("") },
    },
    async ({ project_id, path }) => dump(await get(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`)),
  );

  server.registerTool(
    "rtdb_set",
    {
      description:
        "Overwrite the node at path with value (any JSON-serializable data). An empty path targets the tree root.",
      inputSchema: { project_id: z.string().optional(), path: z.string(), value: z.unknown() },
    },
    async ({ project_id, path, value }) =>
      dump(await put(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`, value)),
  );

  server.registerTool(
    "rtdb_update",
    {
      description: "Shallow-merge value (a JSON object) into the existing node at path.",
      inputSchema: { project_id: z.string().optional(), path: z.string(), value: z.record(z.string(), z.unknown()) },
    },
    async ({ project_id, path, value }) =>
      dump(await patch(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`, value)),
  );

  server.registerTool(
    "rtdb_delete",
    {
      description: "Delete the node at path (or the entire tree if path is empty). Irreversible.",
      inputSchema: { project_id: z.string().optional(), path: z.string().default("") },
    },
    async ({ project_id, path }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/rtdb/${path}`);
      return dump({ deleted: path || "/" });
    },
  );

  return server;
}
