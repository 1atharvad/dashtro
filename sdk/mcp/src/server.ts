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
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CMS_API_URL = process.env.CMS_API_URL ?? "http://localhost:7312/api/sdk";
const CMS_API_KEY = process.env.CMS_API_KEY ?? "";
const CMS_PROJECT_ID = process.env.CMS_PROJECT_ID ?? "";

// ── Guardrails ────────────────────────────────────────────────────────────

const RATE_LIMIT_RPM = parseInt(process.env.MCP_RATE_LIMIT ?? "60", 10);
const MAX_BODY_SIZE = parseInt(process.env.MCP_MAX_BODY_SIZE ?? "1048576", 10); // 1MB
const READ_ONLY = process.env.MCP_READ_ONLY === "true";

// Token bucket rate limiter (per-process, in-memory)
const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) ?? { tokens: RATE_LIMIT_RPM, lastRefill: now };
  const elapsedMinutes = (now - bucket.lastRefill) / 60000;
  bucket.tokens = Math.min(RATE_LIMIT_RPM, bucket.tokens + elapsedMinutes * RATE_LIMIT_RPM);
  if (bucket.tokens < 1) {
    throw new Error(`Rate limit exceeded: ${RATE_LIMIT_RPM} requests/minute`);
  }
  bucket.tokens -= 1;
  bucket.lastRefill = now;
  rateLimitBuckets.set(key, bucket);
}

/** Sanitize input: trim strings, limit size, reject suspicious patterns. */
function sanitizeInput(obj: unknown, path = ""): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    const trimmed = obj.trim();
    if (trimmed.length > 10000) throw new Error(`${path}: string too long (max 10000 chars)`);
    // Case-insensitive XSS detection (match Python behavior)
    const lower = trimmed.toLowerCase();
    if (trimmed.includes("<") && trimmed.includes(">") && (lower.includes("script") || lower.includes("onerror"))) {
      throw new Error(`${path}: suspicious content rejected`);
    }
    return trimmed;
  }
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) throw new Error(`${path}: invalid number`);
    return obj;
  }
  if (typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) {
    if (obj.length > 1000) throw new Error(`${path}: array too large (max 1000)`);
    return obj.map((v, i) => sanitizeInput(v, `${path}[${i}]`));
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length > 100) throw new Error(`${path}: object too many keys (max 100)`);
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      if (k.length > 100) continue; // silently filter, match Python behavior
      result[k] = sanitizeInput(v, `${path}.${k}`);
    }
    return result;
  }
  throw new Error(`${path}: unsupported type ${typeof obj}`);
}

/** Validate request body size. */
function validateBodySize(body: unknown): void {
  const size = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (size > MAX_BODY_SIZE) {
    throw new Error(`Request body too large: ${size} bytes (max ${MAX_BODY_SIZE})`);
  }
}

/** Check if tool is a write operation. */
function isWriteTool(name: string): boolean {
  return /^(create|update|delete|set|rtdb_set|rtdb_update|rtdb_delete)/.test(name);
}

/** Guardrail wrapper for tool handlers. */
function withGuardrails<T extends Record<string, unknown>>(
  toolName: string,
  handler: (args: T) => Promise<unknown>,
) {
  return async (args: T) => {
    const clientKey = `${toolName}:${CMS_API_KEY.slice(0, 8)}`;
    checkRateLimit(clientKey);
    validateBodySize(args);
    const sanitized = sanitizeInput(args) as T;
    if (READ_ONLY && isWriteTool(toolName)) {
      throw new Error(`Write operations disabled (MCP_READ_ONLY=true)`);
    }
    return handler(sanitized);
  };
}

/** Resolve project_id: explicit arg > env var > throw. Treats empty string as not provided. */
function resolveProjectId(explicit?: string): string {
  const id = (explicit && explicit.trim()) || CMS_PROJECT_ID;
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

/** Serialize obj to compact JSON for a tool's text response. */
function dump(obj: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

// ── MCP Resources & Prompts (Usage Instructions) ────────────────────────────

const USAGE_INSTRUCTIONS = `# DashTro CMS MCP — Usage Guide

## Quick Start
1. Set \`CMS_API_URL\` (e.g., \`https://admin.example.com/api/sdk\`)
2. Set \`CMS_API_KEY\` (scoped per-collection from CMS Settings → API Keys)
3. Optional: Set \`CMS_PROJECT_ID\` to avoid passing \`project_id\` on every call

## Token Optimization (Critical for Free Models)
- **Default: \`minimal=true\`** on \`list_collections\`, \`list_documents\`, \`get_document\` — returns only essential fields (~50-70% token savings)
- Use \`minimal=false\` only when you need full metadata (schema names, statuses, etc.)
- **Compact JSON** — all responses use no pretty-print indentation (~30-50% savings)

## Project/Workspace Hierarchy
\`\`\`
Project (production workspace is read-only)
├── Workspace (e.g., "staging", "draft")  ← write here
│   └── Collection (backed by a Schema)
│       └── Document (draft → published)
\`\`\`

**Key rule**: The auto-created "production" workspace is **read-only** for direct document writes. Always create a workspace first (\`create_workspace\`), then write documents there.

## Common Workflows

### Create Content
1. \`create_workspace\` → creates "staging" workspace
2. \`list_schema\` → find/create schema (\`create_schema_field\`)
3. \`create_collection\` → bind collection to schema
4. \`create_document\` → write content in staging workspace
5. \`update_document_status\` → set \`published\`

### Read Content Efficiently
- \`list_collections {minimal: true}\` → just names & schemas
- \`list_documents {minimal: true}\` → just IDs & labels
- \`get_document {minimal: true, depth: 0}\` → single document, no reference expansion

## Guardrails (Auto-Enforced)
| Protection | Config | Default |
|------------|--------|---------|
| Rate limit | \`MCP_RATE_LIMIT\` | 60 RPM |
| Input sanitization | 10k chars, XSS detection | Always on |
| Body size | \`MCP_MAX_BODY_SIZE\` | 1 MB |
| Read-only mode | \`MCP_READ_ONLY=true\` | Off |

## Tool Categories
**Write** (blocked in read-only mode): \`create_*\`, \`update_*\`, \`delete_*\`, \`set_*\`
**Read**: \`list_*\`, \`get_*\`, \`rtdb_get\`

## Schema Field Types
- \`String\`, \`Number\`, \`Boolean\`, \`RichText\`
- \`ReferenceDocument\` (links to another collection's document)
- \`ReferenceCollection\` (links to a collection)
- Set \`display_name: true\` on one field to use as document label

## Realtime Database
- \`rtdb_get/set/update/delete\` for key/value storage per project
- Path format: \`settings/homepage\`, \`features/flags\`
- Use for config, feature flags, small JSON blobs

## Troubleshooting
- **401/403**: Check \`CMS_API_KEY\` scope (collection read/write)
- **project_id required**: Set \`CMS_PROJECT_ID\` env or pass explicitly
- **Rate limited**: Wait or increase \`MCP_RATE_LIMIT\`
- **Empty results**: Verify workspace name (production is read-only)`;

const WORKFLOW_PROMPTS = [
  {
    name: "create-content-workflow",
    description: "Step-by-step guide to create a new content type and publish documents",
    arguments: [],
    content: `Follow this workflow to create and publish content:

1. **Create a workspace** (production is read-only):
   \`create_workspace {project_id, workspace_name: "staging"}\`

2. **Define schema** (if not exists):
   \`list_schema {project_id}\` → check existing
   \`create_schema_field {project_id, schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}\`
   \`create_schema_field {project_id, schema_name: "Post", field_name: "body", field_type: "RichText", index: 2}\`
   \`create_schema_field {project_id, schema_name: "Post", field_name: "author", field_type: "ReferenceDocument", index: 3}\`

3. **Create collection** bound to schema:
   \`create_collection {project_id, collection_name: "posts", schema_name: "Post"}\`

4. **Write documents** in staging:
   \`create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {title: "Hello", body: "..."}}\`

5. **Publish**:
   \`update_document_status {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", status: "published"}\`

**Tip**: Use \`minimal: true\` (default) on all list/get calls to save tokens.`,
  },
  {
    name: "read-content-workflow",
    description: "Efficiently browse and fetch content with minimal tokens",
    arguments: [],
    content: `Read content efficiently:

1. **List collections** (minimal):
   \`list_collections {project_id, minimal: true}\`
   → Returns: [{name, schema}]

2. **List documents** in a collection (minimal):
   \`list_documents {project_id, workspace_name: "staging", collection_name: "posts", minimal: true}\`
   → Returns: {document_ids: [...], document_labels: {...}}

3. **Fetch single document** (minimal, no reference expansion):
   \`get_document {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", minimal: true, depth: 0}\`

4. **Need full data?** Set \`minimal: false\`:
   \`list_collections {minimal: false}\` → includes all metadata
   \`get_document {minimal: false, depth: 3}\` → expands references 3 levels

**Token tip**: Default \`minimal=true\` saves ~60% tokens. Only disable when you need statuses, schema names, or reference expansion.`,
  },
  {
    name: "schema-design-workflow",
    description: "Design schemas with proper field types and references",
    arguments: [],
    content: `Schema design best practices:

**Field types:**
- \`String\` — short text (titles, slugs, tags)
- \`Number\` — integers, floats (counts, prices)
- \`Boolean\` — true/false (flags, featured)
- \`RichText\` — long-form content (body, description)
- \`ReferenceDocument\` — link to ONE document in another collection
- \`ReferenceCollection\` — link to a collection (for dynamic queries)

**Design rules:**
1. Set \`display_name: true\` on exactly ONE field per schema (used as label in lists)
2. Use \`index\` to control field order (1 = first)
3. Reference fields store target document IDs, not full objects
4. Reference expansion happens at read time via \`get_document {depth: N}\`

**Example — Blog with Authors:**
\`\`\`
Schema: Author
  - name (String, index: 1, display_name: true)
  - bio (RichText, index: 2)

Schema: Post
  - title (String, index: 1, display_name: true)
  - slug (String, index: 2)
  - body (RichText, index: 3)
  - author (ReferenceDocument, index: 4) → points to Author collection
  - published_at (Number, index: 5) → timestamp
\`\`\`

Then:
\`create_collection {schema_name: "Author", collection_name: "authors"}\`
\`create_collection {schema_name: "Post", collection_name: "posts"}\``,
  },
  {
    name: "troubleshooting-guide",
    description: "Common issues and solutions",
    arguments: [],
    content: `Troubleshooting:

**Authentication Errors (401/403):**
- Verify \`CMS_API_KEY\` is set and valid
- Key must have read/write scope on the target collection
- Check key isn't expired/revoked in CMS Settings → API Keys

**Project ID Required:**
- Set \`CMS_PROJECT_ID\` environment variable, OR
- Pass \`project_id\` explicitly on every tool call

**Rate Limited (429):**
- Default: 60 requests/minute per API key
- Increase \`MCP_RATE_LIMIT\` env var if needed
- Batch operations where possible

**Empty Results:**
- Production workspace is READ-ONLY for writes
- Use a custom workspace: \`create_workspace\` then write there
- Verify workspace_name matches exactly (case-sensitive)

**Reference Not Expanding:**
- \`get_document\` defaults to \`depth: 0\` (no expansion)
- Use \`depth: 3\` (or higher) to expand ReferenceDocument fields
- \`minimal: true\` forces depth=0 — use \`minimal: false\` with explicit depth

**Large Responses:**
- Use \`minimal: true\` on list calls
- Filter client-side instead of fetching full data
- Paginate with multiple calls if needed`,
  },
];

// ── Server ──────────────────────────────────────────────────────────────────

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({ name: "DashTro CMS", version: "0.1.0" });

  // Projects

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new project, complete with its \"production\" workspace. Only works with an unscoped API key (one not already bound to a single project) — a key locked to one project can't create another.",
      inputSchema: { name: z.string(), description: z.string().default("") },
    },
    withGuardrails("create_project", async ({ name, description }) => {
      return dump(await post("/projects/", { name, description }));
    }),
  );

  server.registerTool(
    "update_project",
    {
      description: "Rename a project or change its description.",
      inputSchema: { project_id: z.string().optional(), name: z.string(), description: z.string().default("") },
    },
    withGuardrails("update_project", async ({ project_id, name, description }) => {
      return dump(await put(`/projects/${resolveProjectId(project_id)}/`, { name, description }));
    }),
  );

  server.registerTool(
    "delete_project",
    {
      description:
        "Permanently delete a project, including every workspace, schema field, collection, and document in it. Irreversible.",
      inputSchema: { project_id: z.string().optional() },
    },
    withGuardrails("delete_project", async ({ project_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/`);
      return dump({ deleted: pid });
    }),
  );

  // Workspaces

  server.registerTool(
    "create_workspace",
    {
      description:
        "Create a non-production workspace to write draft content into. A project's auto-created \"production\" workspace is read-only for direct document writes, so a workspace created here is where create_document and update_document actually need to target.",
      inputSchema: { project_id: z.string().optional(), workspace_name: z.string() },
    },
    withGuardrails("create_workspace", async ({ project_id, workspace_name }) => {
      return dump(await post(`/projects/${resolveProjectId(project_id)}/workspaces/`, { workspace_name }));
    }),
  );

  // Schema

  server.registerTool(
    "list_schema",
    {
      description: "List all schema names defined in a project.",
      inputSchema: { project_id: z.string().optional() },
    },
    withGuardrails("list_schema", async ({ project_id }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(`/projects/${pid}/schema/`)) as Record<string, unknown>;
      return dump({ schema_names: data._schema_names ?? [] });
    }),
  );

  server.registerTool(
    "get_schema",
    {
      description: "Get the field definitions for a named schema, including field types and defaults.",
      inputSchema: { project_id: z.string().optional(), schema_name: z.string() },
    },
    withGuardrails("get_schema", async ({ project_id, schema_name }) => {
      return dump(await get(`/projects/${resolveProjectId(project_id)}/schema/${schema_name}/`));
    }),
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
    withGuardrails("create_schema_field", async ({ project_id, schema_name, field_name, field_type, index, display_name }) => {
      return dump(
        await post(`/projects/${resolveProjectId(project_id)}/schema/`, {
          _index: index,
          _name: field_name,
          _type: field_type,
          _schema_name: schema_name,
          _display_name: display_name,
        }),
      );
    }),
  );

  server.registerTool(
    "delete_schema_field",
    {
      description: "Delete a schema field by its id (from create_schema_field's response or get_schema).",
      inputSchema: { project_id: z.string().optional(), field_id: z.string() },
    },
    withGuardrails("delete_schema_field", async ({ project_id, field_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/schema/${field_id}/`);
      return dump({ deleted: field_id });
    }),
  );

  // Collections

  server.registerTool(
    "list_collections",
    {
      description: "List collections in a project. minimal=true (default) returns only names and schema.",
      inputSchema: { project_id: z.string().optional(), minimal: z.boolean().default(true) },
    },
    withGuardrails("list_collections", async ({ project_id, minimal }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(`/projects/${pid}/collections/`)) as Record<string, unknown>;
      const cols = (data._schema_collections ?? []) as Array<{ _collection_name: string; _schema_name: string }>;
      if (minimal) {
        return dump(cols.map((c) => ({ name: c._collection_name, schema: c._schema_name })));
      }
      return dump(cols);
    }),
  );

  server.registerTool(
    "create_collection",
    {
      description:
        "Create a collection backed by an existing schema (create its fields with create_schema_field first). Documents are then written into this collection via create_document.",
      inputSchema: { project_id: z.string().optional(), collection_name: z.string(), schema_name: z.string() },
    },
    withGuardrails("create_collection", async ({ project_id, collection_name, schema_name }) => {
      return dump(
        await post(`/projects/${resolveProjectId(project_id)}/collections/`, {
          _index: 1,
          _collection_name: collection_name,
          _schema_name: schema_name,
        }),
      );
    }),
  );

  server.registerTool(
    "delete_collection",
    {
      description: "Permanently delete a collection and its documents across every workspace. Irreversible.",
      inputSchema: { project_id: z.string().optional(), collection_id: z.string() },
    },
    withGuardrails("delete_collection", async ({ project_id, collection_id }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/collections/${collection_id}/`);
      return dump({ deleted: collection_id });
    }),
  );

  // Documents

  server.registerTool(
    "list_documents",
    {
      description: "List documents in a collection. minimal=true (default) returns only IDs and labels.",
      inputSchema: {
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        minimal: z.boolean().default(true),
      },
    },
    withGuardrails("list_documents", async ({ project_id, workspace_name, collection_name, minimal }) => {
      const pid = resolveProjectId(project_id);
      const data = (await get(
        `/projects/${pid}/workspace/${workspace_name}/collection/${collection_name}/`,
      )) as Record<string, unknown>;
      if (minimal) {
        return dump({
          document_ids: data._document_ids ?? [],
          document_labels: data._document_labels ?? {},
        });
      }
      return dump({
        schema_name: data._schema_name,
        document_ids: data._document_ids ?? [],
        document_labels: data._document_labels ?? {},
        document_statuses: data._document_statuses ?? {},
      });
    }
  )
);

  server.registerTool(
    "get_document",
    {
      description: "Fetch a document. minimal=true (default) skips reference inlining (depth=0).",
      inputSchema: {
        project_id: z.string().optional(),
        workspace_name: z.string(),
        collection_name: z.string(),
        document_id: z.string(),
        minimal: z.boolean().default(true),
        depth: z.number().int().default(3),
      },
    },
    withGuardrails("get_document", async ({ project_id, workspace_name, collection_name, document_id, minimal, depth }) => {
      return dump(
        await get(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
          { depth: minimal ? 0 : depth },
        ),
      );
    }),
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
        data: z.record(z.string(), z.unknown()).default({}),
      },
    },
    withGuardrails("create_document", async ({ project_id, workspace_name, collection_name, data }) => {
      return dump(
        await post(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/`,
          data ?? {},
        ),
      );
    }),
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
        data: z.record(z.string(), z.unknown()).default({}),
      },
    },
    withGuardrails("update_document", async ({ project_id, workspace_name, collection_name, document_id, data }) => {
      return dump(
        await put(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
          data ?? {},
        ),
      );
    }),
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
    withGuardrails("update_document_status", async ({ project_id, workspace_name, collection_name, document_id, status }) => {
      return dump(
        await patch(
          `/projects/${resolveProjectId(project_id)}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/status/`,
          { _status: status },
        ),
      );
    }),
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
    withGuardrails("delete_document", async ({ project_id, workspace_name, collection_name, document_id }) => {
      const pid = resolveProjectId(project_id);
      await del(
        `/projects/${pid}/workspace/${workspace_name}/collection/${collection_name}/document/${document_id}/`,
      );
      return dump({ deleted: document_id });
    }),
  );

  // Realtime Database

  server.registerTool(
    "rtdb_get",
    {
      description:
        "Read a node (or the whole tree if path is empty) from a project's Realtime Database. path is a '/'-delimited key path, e.g. 'settings/homepage'.",
      inputSchema: { project_id: z.string().optional(), path: z.string().default("") },
    },
    withGuardrails("rtdb_get", async ({ project_id, path }) => {
      return dump(await get(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`));
    }),
  );

  server.registerTool(
    "rtdb_set",
    {
      description:
        "Overwrite the node at path with value (any JSON-serializable data). An empty path targets the tree root.",
      inputSchema: { project_id: z.string().optional(), path: z.string(), value: z.unknown() },
    },
    withGuardrails("rtdb_set", async ({ project_id, path, value }) => {
      return dump(await put(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`, value));
    }),
  );

  server.registerTool(
    "rtdb_update",
    {
      description: "Shallow-merge value (a JSON object) into the existing node at path.",
      inputSchema: { project_id: z.string().optional(), path: z.string(), value: z.record(z.string(), z.unknown()).default({}) },
    },
    withGuardrails("rtdb_update", async ({ project_id, path, value }) => {
      return dump(await patch(`/projects/${resolveProjectId(project_id)}/rtdb/${path}`, value ?? {}));
    }),
  );

  server.registerTool(
    "rtdb_delete",
    {
      description: "Delete the node at path (or the entire tree if path is empty). Irreversible.",
      inputSchema: { project_id: z.string().optional(), path: z.string().default("") },
    },
    withGuardrails("rtdb_delete", async ({ project_id, path }) => {
      const pid = resolveProjectId(project_id);
      await del(`/projects/${pid}/rtdb/${path}`);
      return dump({ deleted: path || "/" });
    }),
  );

  // ── Resources (readable by any MCP client) ──────────────────────────────────

  server.registerResource(
    "usage-instructions",
    "dashtro://usage",
    {
      title: "DashTro CMS MCP Usage Guide",
      description: "Complete usage guide with token optimization, workflows, and best practices",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [{ uri: "dashtro://usage", mimeType: "text/markdown", text: USAGE_INSTRUCTIONS }],
    }),
  );

  // ── Prompts (reusable prompt templates) ────────────────────────────────────

  for (const prompt of WORKFLOW_PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: prompt.description,
        argsSchema: {},
      },
      async () => ({
        messages: [{ role: "user", content: { type: "text", text: prompt.content } }],
      }),
    );
  }

  // ── Auto-load Skills from skills/ directory ─────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSkillsDir(): string {
  // Handle both ESM (import.meta.url) and CJS (__dirname) environments
  try {
    // ESM
    return join(dirname(fileURLToPath(import.meta.url)), "skills");
  } catch {
    // CJS fallback
    return join(__dirname, "skills");
  }
}

async function loadSkills(server: McpServer): Promise<void> {
  const skillsDir = getSkillsDir();
  try {
    const files = await readdir(skillsDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const skillName = file.replace(".md", "");
      const content = await readFile(join(skillsDir, file), "utf-8");

      // Register as resource
      server.registerResource(
        `skill-${skillName}`,
        `dashtro://skills/${skillName}`,
        {
          title: `Skill: ${toTitleCase(skillName)}`,
          description: `Skill: ${toTitleCase(skillName)}`,
          mimeType: "text/markdown",
        },
        async () => ({
          contents: [{ uri: `dashtro://skills/${skillName}`, mimeType: "text/markdown", text: content }],
        }),
      );

      // Register as prompt
      server.registerPrompt(
        skillName,
        {
          title: toTitleCase(skillName),
          description: `Skill: ${toTitleCase(skillName)}`,
          argsSchema: {},
        },
        async () => ({
          messages: [{ role: "user", content: { type: "text", text: content } }],
        }),
      );
    }
  } catch {
    // Skills directory doesn't exist or is empty — ignore
  }
}

await loadSkills(server);

return server;
}
