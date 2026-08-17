"""
DashTro CMS — MCP Server

Exposes the CMS SDK REST API (/api/sdk/*) as MCP tools so Claude (or any MCP
client) can read and write project content directly. Uses API-key auth only
(X-API-Key) — never a user's JWT — so what an MCP client can do is exactly
what the configured API key is scoped to (project/collections/read-write).

That also means tools with no API-key-authorized equivalent aren't exposed
here: listing all projects, listing/renaming individual schema fields,
push-to-production, and document version history are all admin (JWT-only)
operations on the /api/cms/* surface.

Configuration (env vars):
  CMS_API_URL       — base URL of the CMS backend's SDK API, e.g.
                      http://localhost:7312/api/sdk
  CMS_API_KEY       — API key for authenticated requests, scoped per collection
                      (read/write) from the CMS's settings page
  CMS_PROJECT_ID    — default project ID (optional, used when project_id not provided)
  MCP_RATE_LIMIT    — requests per minute (default: 60)
  MCP_MAX_BODY_SIZE — max request body bytes (default: 1048576 = 1MB)
  MCP_READ_ONLY     — "true" to disable write tools (default: false)
"""

import json
import math
import os
import time
from collections import defaultdict
from functools import wraps
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

CMS_API_URL = os.environ.get("CMS_API_URL", "http://localhost:7312/api/sdk")
CMS_API_KEY = os.environ.get("CMS_API_KEY", "")
CMS_PROJECT_ID = os.environ.get("CMS_PROJECT_ID", "")

# ── Guardrails ──────────────────────────────────────────────────────────────────

RATE_LIMIT_RPM = int(os.environ.get("MCP_RATE_LIMIT", "60"))
MAX_BODY_SIZE = int(os.environ.get("MCP_MAX_BODY_SIZE", "1048576"))  # 1MB
READ_ONLY = os.environ.get("MCP_READ_ONLY", "false").lower() == "true"

# Token bucket rate limiter (per-process, in-memory)
_rate_buckets: dict[str, dict[str, float]] = defaultdict(
    lambda: {"tokens": float(RATE_LIMIT_RPM), "last_refill": time.time()}
)


def _check_rate_limit(key: str) -> None:
    """Token bucket rate limiter."""
    now = time.time()
    bucket = _rate_buckets[key]
    elapsed_minutes = (now - bucket["last_refill"]) / 60
    bucket["tokens"] = min(RATE_LIMIT_RPM, bucket["tokens"] + elapsed_minutes * RATE_LIMIT_RPM)
    if bucket["tokens"] < 1:
        raise ValueError(f"Rate limit exceeded: {RATE_LIMIT_RPM} requests/minute")
    bucket["tokens"] -= 1
    bucket["last_refill"] = now


def _sanitize_input(obj: Any, path: str = "") -> Any:
    """Sanitize input: trim strings, limit size, reject suspicious patterns."""
    if obj is None:
        return obj
    if isinstance(obj, str):
        trimmed = obj.strip()
        if len(trimmed) > 10000:
            raise ValueError(f"{path}: string too long (max 10000 chars)")
        if (
            "<" in trimmed
            and ">" in trimmed
            and ("script" in trimmed.lower() or "onerror" in trimmed.lower())
        ):
            raise ValueError(f"{path}: suspicious content rejected")
        return trimmed
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        if math.isnan(obj) or obj == float("inf") or obj == float("-inf"):
            raise ValueError(f"{path}: invalid number")
        return obj
    if isinstance(obj, list):
        if len(obj) > 1000:
            raise ValueError(f"{path}: array too large (max 1000)")
        return [_sanitize_input(v, f"{path}[{i}]") for i, v in enumerate(obj)]
    if isinstance(obj, dict):
        if len(obj) > 100:
            raise ValueError(f"{path}: object too many keys (max 100)")
        return {k: _sanitize_input(v, f"{path}.{k}") for k, v in obj.items() if len(k) <= 100}
    raise ValueError(f"{path}: unsupported type {type(obj).__name__}")


def _validate_body_size(body: Any) -> None:
    """Validate request body size."""
    size = len(json.dumps(body, default=str).encode("utf-8"))
    if size > MAX_BODY_SIZE:
        raise ValueError(f"Request body too large: {size} bytes (max {MAX_BODY_SIZE})")


def _is_write_tool(name: str) -> bool:
    """Check if tool is a write operation."""
    return name.startswith(
        ("create", "update", "delete", "set", "rtdb_set", "rtdb_update", "rtdb_delete")
    )


def with_guardrails(tool_name: str):
    """Decorator to apply guardrails to tool handlers."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            client_key = f"{tool_name}:{CMS_API_KEY[:8]}"
            _check_rate_limit(client_key)
            # Validate and sanitize kwargs (the tool arguments)
            _validate_body_size(kwargs)
            sanitized = _sanitize_input(kwargs)
            if READ_ONLY and _is_write_tool(tool_name):
                raise ValueError("Write operations disabled (MCP_READ_ONLY=true)")
            return await func(*args, **sanitized)

        return wrapper

    return decorator


def _resolve_project_id(explicit: str | None) -> str:
    """Resolve project_id: explicit arg > env var > raise. Treats empty/whitespace string as not provided."""
    pid = (explicit.strip() if explicit else None) or CMS_PROJECT_ID
    if not pid:
        raise ValueError(
            "project_id is required (provide as argument or set CMS_PROJECT_ID env var)"
        )
    return pid


mcp = FastMCP("DashTro CMS")


# ── HTTP helpers ──────────────────────────────────────────────────────────────


def _headers() -> dict:
    """JSON content-type header, plus X-API-Key if CMS_API_KEY is set."""
    h = {"Content-Type": "application/json"}
    if CMS_API_KEY:
        h["X-API-Key"] = CMS_API_KEY
    return h


def _url(path: str) -> str:
    """Join CMS_API_URL and path into a full request URL."""
    return f"{CMS_API_URL.rstrip('/')}{path}"


async def _get(path: str, params: dict | None = None) -> dict | list:
    """GET path and return the parsed JSON body, raising on a non-2xx response."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(_url(path), headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, data: dict | None = None) -> dict:
    """POST data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(_url(path), headers=_headers(), json=data or {})
        r.raise_for_status()
        return r.json()


async def _put(path: str, data: dict) -> dict:
    """PUT data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.put(_url(path), headers=_headers(), json=data)
        r.raise_for_status()
        return r.json()


async def _patch(path: str, data: dict) -> dict:
    """PATCH data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.patch(_url(path), headers=_headers(), json=data)
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> None:
    """DELETE path, raising on a non-2xx response."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(_url(path), headers=_headers())
        r.raise_for_status()


def _dump(obj) -> str:
    """Serialize obj to compact JSON for a tool's text response."""
    return json.dumps(obj, default=str, separators=(",", ":"))


# ── Projects ──────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("create_project")
async def create_project(name: str, description: str = "") -> str:
    """
    Create a new project, complete with its "production" workspace.
    Only works with an unscoped API key (one not already bound to a single
    project) — a key locked to one project can't create another.
    """
    return _dump(await _post("/projects/", data={"name": name, "description": description}))


@mcp.tool()
@with_guardrails("update_project")
async def update_project(
    project_id: str | None = None, name: str = "", description: str = ""
) -> str:
    """Rename a project or change its description."""
    if not name:
        raise ValueError("name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/", data={"name": name, "description": description}))


@mcp.tool()
@with_guardrails("delete_project")
async def delete_project(project_id: str | None = None) -> str:
    """
    Permanently delete a project, including every workspace, schema field,
    collection, and document in it. Irreversible.
    """
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/")
    return _dump({"deleted": pid})


# ── Workspaces ────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("create_workspace")
async def create_workspace(project_id: str | None = None, workspace_name: str = "") -> str:
    """
    Create a non-production workspace to write draft content into.
    A project's auto-created "production" workspace is read-only for direct
    document writes, so a workspace created here is where create_document
    and update_document actually need to target.
    """
    if not workspace_name:
        raise ValueError("workspace_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(f"/projects/{pid}/workspaces/", data={"workspace_name": workspace_name})
    )


# ── Schema ────────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_schema")
async def list_schema(project_id: str | None = None) -> str:
    """List all schema names defined in a project."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/schema/")
    return _dump({"schema_names": data.get("_schema_names", [])})


@mcp.tool()
@with_guardrails("get_schema")
async def get_schema(project_id: str | None = None, schema_name: str = "") -> str:
    """Get the field definitions for a named schema, including field types and defaults."""
    if not schema_name:
        raise ValueError("schema_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/schema/{schema_name}/"))


@mcp.tool()
@with_guardrails("create_schema_field")
async def create_schema_field(
    project_id: str | None = None,
    schema_name: str = "",
    field_name: str = "",
    field_type: str = "",
    index: int = 1,
    display_name: bool = False,
) -> str:
    """
    Add a field to a schema (creating the schema itself the first time a
    field references it). field_type is e.g. 'String', 'Number', 'Boolean',
    'RichText', 'ReferenceDocument'. Set display_name=True to make this
    field the one shown as a document's label in lists.
    """
    if not schema_name:
        raise ValueError("schema_name is required and cannot be empty")
    if not field_name:
        raise ValueError("field_name is required and cannot be empty")
    if not field_type:
        raise ValueError("field_type is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/schema/",
            data={
                "_index": index,
                "_name": field_name,
                "_type": field_type,
                "_schema_name": schema_name,
                "_display_name": display_name,
            },
        )
    )


@mcp.tool()
@with_guardrails("delete_schema_field")
async def delete_schema_field(project_id: str | None = None, field_id: str = "") -> str:
    """Delete a schema field by its id (from create_schema_field's response or get_schema)."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/schema/{field_id}/")
    return _dump({"deleted": field_id})


# ── Collections ───────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_collections")
async def list_collections(project_id: str | None = None, minimal: bool = True) -> str:
    """List collections in a project. minimal=True (default) returns only names and schema."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/collections/")
    cols = data.get("_schema_collections", [])
    if minimal:
        return _dump(
            [{"name": c.get("_collection_name"), "schema": c.get("_schema_name")} for c in cols]
        )
    return _dump(cols)


@mcp.tool()
@with_guardrails("create_collection")
async def create_collection(
    project_id: str | None = None, collection_name: str = "", schema_name: str = ""
) -> str:
    """
    Create a collection backed by an existing schema (create its fields
    with create_schema_field first). Documents are then written into this
    collection via create_document.
    """
    if not collection_name:
        raise ValueError("collection_name is required and cannot be empty")
    if not schema_name:
        raise ValueError("schema_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/collections/",
            data={"_index": 1, "_collection_name": collection_name, "_schema_name": schema_name},
        )
    )


@mcp.tool()
@with_guardrails("delete_collection")
async def delete_collection(project_id: str | None = None, collection_id: str = "") -> str:
    """
    Permanently delete a collection and its documents across every
    workspace. Irreversible.
    """
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/collections/{collection_id}/")
    return _dump({"deleted": collection_id})


# ── Documents ─────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_documents")
async def list_documents(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    minimal: bool = True,
) -> str:
    """
    List documents in a collection. minimal=True (default) returns only IDs and labels.
    """
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/")
    if minimal:
        return _dump(
            {
                "document_ids": data.get("_document_ids", []),
                "document_labels": data.get("_document_labels", {}),
            }
        )
    return _dump(
        {
            "schema_name": data.get("_schema_name"),
            "document_ids": data.get("_document_ids", []),
            "document_labels": data.get("_document_labels", {}),
            "document_statuses": data.get("_document_statuses", {}),
        }
    )


@mcp.tool()
@with_guardrails("get_document")
async def get_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    minimal: bool = True,
    depth: int = 3,
) -> str:
    """
    Fetch a document. minimal=True (default) skips reference inlining (depth=0).
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _get(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            params={"depth": 0 if minimal else depth},
        )
    )


@mcp.tool()
@with_guardrails("create_document")
async def create_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    data: dict | None = None,
) -> str:
    """
    Create a new document in a collection.
    data keys must match the collection's schema field names.
    New documents default to _status='draft'. Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/",
            data=data or {},
        )
    )


@mcp.tool()
@with_guardrails("update_document")
async def update_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    data: dict | None = None,
) -> str:
    """
    Update fields on an existing document. Only include keys you want to change.
    The previous state is automatically saved as a version before the update is applied.
    Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _put(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            data=data or {},
        )
    )


@mcp.tool()
@with_guardrails("update_document_status")
async def update_document_status(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    status: str = "",
) -> str:
    """
    Change a document's publish status. status must be 'draft' or 'published'.
    Production workspace is read-only.
    """
    if status not in ("draft", "published"):
        raise ValueError("status must be 'draft' or 'published'")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _patch(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/",
            data={"_status": status},
        )
    )


@mcp.tool()
@with_guardrails("delete_document")
async def delete_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
) -> str:
    """
    Permanently delete a document from a collection.
    Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    await _delete(
        f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
    )
    return _dump({"deleted": document_id})


# ── Realtime Database ─────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("rtdb_get")
async def rtdb_get(project_id: str | None = None, path: str = "") -> str:
    """
    Read a node (or the whole tree if path is empty) from a project's Realtime Database.
    path is a '/'-delimited key path, e.g. 'settings/homepage'.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/rtdb/{path}"))


@mcp.tool()
@with_guardrails("rtdb_set")
async def rtdb_set(project_id: str | None = None, path: str = "", value: Any = None) -> str:
    """
    Overwrite the node at path with value (any JSON-serializable data).
    An empty path targets the tree root.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/rtdb/{path}", data=value))


@mcp.tool()
@with_guardrails("rtdb_update")
async def rtdb_update(
    project_id: str | None = None, path: str = "", value: dict | None = None
) -> str:
    """Shallow-merge value (a JSON object) into the existing node at path."""
    pid = _resolve_project_id(project_id)
    return _dump(await _patch(f"/projects/{pid}/rtdb/{path}", data=value or {}))


@mcp.tool()
@with_guardrails("rtdb_delete")
async def rtdb_delete(project_id: str | None = None, path: str = "") -> str:
    """Delete the node at path (or the entire tree if path is empty). Irreversible."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/rtdb/{path}")
    return _dump({"deleted": path or "/"})


# ── Resources (readable by any MCP client) ──────────────────────────────────


USAGE_INSTRUCTIONS = """# DashTro CMS MCP — Usage Guide

## Quick Start
1. Set `CMS_API_URL` (e.g., `https://admin.example.com/api/sdk`)
2. Set `CMS_API_KEY` (scoped per-collection from CMS Settings → API Keys)
3. Optional: Set `CMS_PROJECT_ID` to avoid passing `project_id` on every call

## Token Optimization (Critical for Free Models)
- **Default: `minimal=true`** on `list_collections`, `list_documents`, `get_document` — returns only essential fields (~50-70% token savings)
- Use `minimal=false` only when you need full metadata (schema names, statuses, etc.)
- **Compact JSON** — all responses use no pretty-print indentation (~30-50% savings)

## Project/Workspace Hierarchy
```
Project (production workspace is read-only)
├── Workspace (e.g., "staging", "draft")  ← write here
│   └── Collection (backed by a Schema)
│       └── Document (draft → published)
```

**Key rule**: The auto-created "production" workspace is **read-only** for direct document writes. Always create a workspace first (`create_workspace`), then write documents there.

## Common Workflows

### Create Content
1. `create_workspace` → creates "staging" workspace
2. `list_schema` → find/create schema (`create_schema_field`)
3. `create_collection` → bind collection to schema
4. `create_document` → write content in staging workspace
5. `update_document_status` → set `published`

### Read Content Efficiently
- `list_collections {minimal: true}` → just names & schemas
- `list_documents {minimal: true}` → just IDs & labels
- `get_document {minimal: true, depth: 0}` → single document, no reference expansion

## Guardrails (Auto-Enforced)
| Protection | Config | Default |
|------------|--------|---------|
| Rate limit | `MCP_RATE_LIMIT` | 60 RPM |
| Input sanitization | 10k chars, XSS detection | Always on |
| Body size | `MCP_MAX_BODY_SIZE` | 1 MB |
| Read-only mode | `MCP_READ_ONLY=true` | Off |

## Tool Categories
**Write** (blocked in read-only mode): `create_*`, `update_*`, `delete_*`, `set_*`
**Read**: `list_*`, `get_*`, `rtdb_get`

## Schema Field Types
- `String`, `Number`, `Boolean`, `RichText`
- `ReferenceDocument` (links to another collection's document)
- `ReferenceCollection` (links to a collection)
- Set `display_name: true` on one field to use as document label

## Realtime Database
- `rtdb_get/set/update/delete` for key/value storage per project
- Path format: `settings/homepage`, `features/flags`
- Use for config, feature flags, small JSON blobs

## Troubleshooting
- **401/403**: Check `CMS_API_KEY` scope (collection read/write)
- **project_id required**: Set `CMS_PROJECT_ID` env or pass explicitly
- **Rate limited**: Wait or increase `MCP_RATE_LIMIT`
- **Empty results**: Verify workspace name (production is read-only)"""


@mcp.resource("dashtro://usage", mime_type="text/markdown")
async def usage_instructions() -> str:
    """Complete usage guide with token optimization, workflows, and best practices."""
    return USAGE_INSTRUCTIONS


# ── Prompts (reusable prompt templates) ───────────────────────────────────


@mcp.prompt(
    name="create-content-workflow",
    description="Step-by-step guide to create a new content type and publish documents",
)
async def create_content_workflow() -> str:
    return """Follow this workflow to create and publish content:

1. **Create a workspace** (production is read-only):
   `create_workspace {project_id, workspace_name: "staging"}`

2. **Define schema** (if not exists):
   `list_schema {project_id}` → check existing
   `create_schema_field {project_id, schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}`
   `create_schema_field {project_id, schema_name: "Post", field_name: "body", field_type: "RichText", index: 2}`
   `create_schema_field {project_id, schema_name: "Post", field_name: "author", field_type: "ReferenceDocument", index: 3}`

3. **Create collection** bound to schema:
   `create_collection {project_id, collection_name: "posts", schema_name: "Post"}`

4. **Write documents** in staging:
   `create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {title: "Hello", body: "..."}}`

5. **Publish**:
   `update_document_status {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", status: "published"}`

**Tip**: Use `minimal: true` (default) on all list/get calls to save tokens."""


@mcp.prompt(
    name="read-content-workflow",
    description="Efficiently browse and fetch content with minimal tokens",
)
async def read_content_workflow() -> str:
    return """Read content efficiently:

1. **List collections** (minimal):
   `list_collections {project_id, minimal: true}`
   → Returns: [{name, schema}]

2. **List documents** in a collection (minimal):
   `list_documents {project_id, workspace_name: "staging", collection_name: "posts", minimal: true}`
   → Returns: {document_ids: [...], document_labels: {...}}

3. **Fetch single document** (minimal, no reference expansion):
   `get_document {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", minimal: true, depth: 0}`

4. **Need full data?** Set `minimal: false`:
   `list_collections {minimal: false}` → includes all metadata
   `get_document {minimal: false, depth: 3}` → expands references 3 levels

**Token tip**: Default `minimal=true` saves ~60% tokens. Only disable when you need statuses, schema names, or reference expansion."""


@mcp.prompt(
    name="schema-design-workflow",
    description="Design schemas with proper field types and references",
)
async def schema_design_workflow() -> str:
    return """Schema design best practices:

**Field types:**
- `String` — short text (titles, slugs, tags)
- `Number` — integers, floats (counts, prices)
- `Boolean` — true/false (flags, featured)
- `RichText` — long-form content (body, description)
- `ReferenceDocument` — link to ONE document in another collection
- `ReferenceCollection` — link to a collection (for dynamic queries)

**Design rules:**
1. Set `display_name: true` on exactly ONE field per schema (used as label in lists)
2. Use `index` to control field order (1 = first)
3. Reference fields store target document IDs, not full objects
4. Reference expansion happens at read time via `get_document {depth: N}`

**Example — Blog with Authors:**
```
Schema: Author
  - name (String, index: 1, display_name: true)
  - bio (RichText, index: 2)

Schema: Post
  - title (String, index: 1, display_name: true)
  - slug (String, index: 2)
  - body (RichText, index: 3)
  - author (ReferenceDocument, index: 4) → points to Author collection
  - published_at (Number, index: 5) → timestamp
```

Then:
`create_collection {schema_name: "Author", collection_name: "authors"}`
`create_collection {schema_name: "Post", collection_name: "posts"}`"""


@mcp.prompt(
    name="troubleshooting-guide",
    description="Common issues and solutions",
)
async def troubleshooting_guide() -> str:
    return """Troubleshooting:

**Authentication Errors (401/403):**
- Verify `CMS_API_KEY` is set and valid
- Key must have read/write scope on the target collection
- Check key isn't expired/revoked in CMS Settings → API Keys

**Project ID Required:**
- Set `CMS_PROJECT_ID` environment variable, OR
- Pass `project_id` explicitly on every tool call

**Rate Limited (429):**
- Default: 60 requests/minute per API key
- Increase `MCP_RATE_LIMIT` env var if needed
- Batch operations where possible

**Empty Results:**
- Production workspace is READ-ONLY for writes
- Use a custom workspace: `create_workspace` then write there
- Verify workspace_name matches exactly (case-sensitive)

**Reference Not Expanding:**
- `get_document` defaults to `depth: 0` (no expansion)
- Use `depth: 3` (or higher) to expand ReferenceDocument fields
- `minimal: true` forces depth=0 — use `minimal: false` with explicit depth

**Large Responses:**
- Use `minimal: true` on list calls
- Filter client-side instead of fetching full data
- Paginate with multiple calls if needed"""


# ── Auto-load Skills from skills/ directory ───────────────────────────────────

import pathlib


def _make_skill_loader(content: str):
    async def _load_skill() -> str:
        return content

    return _load_skill


def _make_skill_prompt(content: str):
    async def _skill_prompt() -> str:
        return content

    return _skill_prompt


_skills_dir = pathlib.Path(__file__).parent / "skills"
if _skills_dir.exists():
    for skill_file in _skills_dir.glob("*.md"):
        skill_content = skill_file.read_text(encoding="utf-8")
        skill_stem = skill_file.stem

        # Register as resource
        mcp.resource(f"dashtro://skills/{skill_stem}", mime_type="text/markdown")(
            _make_skill_loader(skill_content)
        )

        # Register as prompt
        mcp.prompt(
            name=skill_stem,
            description=f"Skill: {skill_stem.replace('-', ' ').title()}",
        )(_make_skill_prompt(skill_content))


if __name__ == "__main__":
    mcp.run()
