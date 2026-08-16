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
  CMS_API_URL  — base URL of the CMS backend's SDK API, e.g.
                 http://localhost:7312/api/sdk
  CMS_API_KEY  — API key for authenticated requests, scoped per collection
                 (read/write) from the CMS's settings page
  CMS_PROJECT_ID — default project ID (optional, used when project_id not provided)
"""

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

CMS_API_URL = os.environ.get("CMS_API_URL", "http://localhost:7312/api/sdk")
CMS_API_KEY = os.environ.get("CMS_API_KEY", "")
CMS_PROJECT_ID = os.environ.get("CMS_PROJECT_ID", "")


def _resolve_project_id(explicit: str | None) -> str:
    """Resolve project_id: explicit arg > env var > raise."""
    pid = explicit or CMS_PROJECT_ID
    if not pid:
        raise ValueError("project_id is required (provide as argument or set CMS_PROJECT_ID env var)")
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
async def create_project(name: str, description: str = "") -> str:
    """
    Create a new project, complete with its "production" workspace.
    Only works with an unscoped API key (one not already bound to a single
    project) — a key locked to one project can't create another.
    """
    return _dump(await _post("/projects/", data={"name": name, "description": description}))


@mcp.tool()
async def update_project(project_id: str | None = None, name: str = "", description: str = "") -> str:
    """Rename a project or change its description."""
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/", data={"name": name, "description": description}))


@mcp.tool()
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
async def create_workspace(project_id: str | None = None, workspace_name: str = "") -> str:
    """
    Create a non-production workspace to write draft content into.
    A project's auto-created "production" workspace is read-only for direct
    document writes, so a workspace created here is where create_document
    and update_document actually need to target.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _post(f"/projects/{pid}/workspaces/", data={"workspace_name": workspace_name}))


# ── Schema ────────────────────────────────────────────────────────────────────


@mcp.tool()
async def list_schema(project_id: str | None = None) -> str:
    """List all schema names defined in a project."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/schema/")
    return _dump({"schema_names": data.get("_schema_names", [])})


@mcp.tool()
async def get_schema(project_id: str | None = None, schema_name: str = "") -> str:
    """Get the field definitions for a named schema, including field types and defaults."""
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/schema/{schema_name}/"))


@mcp.tool()
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
async def delete_schema_field(project_id: str | None = None, field_id: str = "") -> str:
    """Delete a schema field by its id (from create_schema_field's response or get_schema)."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/schema/{field_id}/")
    return _dump({"deleted": field_id})


# ── Collections ───────────────────────────────────────────────────────────────


@mcp.tool()
async def list_collections(project_id: str | None = None) -> str:
    """List all collections in a project with their schema associations."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/collections/")
    return _dump(data.get("_schema_collections", []))


@mcp.tool()
async def create_collection(project_id: str | None = None, collection_name: str = "", schema_name: str = "") -> str:
    """
    Create a collection backed by an existing schema (create its fields
    with create_schema_field first). Documents are then written into this
    collection via create_document.
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/collections/",
            data={"_index": 1, "_collection_name": collection_name, "_schema_name": schema_name},
        )
    )


@mcp.tool()
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
async def list_documents(project_id: str | None = None, workspace_name: str = "", collection_name: str = "") -> str:
    """
    List all documents in a collection.
    Returns document IDs, their display labels, and publish statuses (draft/published).
    """
    pid = _resolve_project_id(project_id)
    data = await _get(
        f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/"
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
async def get_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    depth: int = 3,
) -> str:
    """
    Fetch a single document with referenced documents inlined.
    depth controls how many levels of ReferenceDocument fields are resolved (default 3).
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _get(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            params={"depth": depth},
        )
    )


@mcp.tool()
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
    pid = _resolve_project_id(project_id)
    return _dump(
        await _patch(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/",
            data={"_status": status},
        )
    )


@mcp.tool()
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
async def rtdb_get(project_id: str | None = None, path: str = "") -> str:
    """
    Read a node (or the whole tree if path is empty) from a project's Realtime Database.
    path is a '/'-delimited key path, e.g. 'settings/homepage'.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/rtdb/{path}"))


@mcp.tool()
async def rtdb_set(project_id: str | None = None, path: str = "", value: Any = None) -> str:
    """
    Overwrite the node at path with value (any JSON-serializable data).
    An empty path targets the tree root.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/rtdb/{path}", data=value))


@mcp.tool()
async def rtdb_update(project_id: str | None = None, path: str = "", value: dict | None = None) -> str:
    """Shallow-merge value (a JSON object) into the existing node at path."""
    pid = _resolve_project_id(project_id)
    return _dump(await _patch(f"/projects/{pid}/rtdb/{path}", data=value or {}))


@mcp.tool()
async def rtdb_delete(project_id: str | None = None, path: str = "") -> str:
    """Delete the node at path (or the entire tree if path is empty). Irreversible."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/rtdb/{path}")
    return _dump({"deleted": path or "/"})


if __name__ == "__main__":
    mcp.run()
