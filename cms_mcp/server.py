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
"""

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

CMS_API_URL = os.environ.get("CMS_API_URL", "http://localhost:7312/api/sdk")
CMS_API_KEY = os.environ.get("CMS_API_KEY", "")

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
    """Serialize obj to pretty-printed JSON for a tool's text response."""
    return json.dumps(obj, indent=2, default=str)


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
async def update_project(project_id: str, name: str, description: str = "") -> str:
    """Rename a project or change its description."""
    return _dump(
        await _put(f"/projects/{project_id}/", data={"name": name, "description": description})
    )


@mcp.tool()
async def delete_project(project_id: str) -> str:
    """
    Permanently delete a project, including every workspace, schema field,
    collection, and document in it. Irreversible.
    """
    await _delete(f"/projects/{project_id}/")
    return _dump({"deleted": project_id})


# ── Workspaces ────────────────────────────────────────────────────────────────


@mcp.tool()
async def create_workspace(project_id: str, workspace_name: str) -> str:
    """
    Create a non-production workspace to write draft content into.
    A project's auto-created "production" workspace is read-only for direct
    document writes, so a workspace created here is where create_document
    and update_document actually need to target.
    """
    return _dump(
        await _post(f"/projects/{project_id}/workspaces/", data={"workspace_name": workspace_name})
    )


# ── Schema ────────────────────────────────────────────────────────────────────


@mcp.tool()
async def list_schema(project_id: str) -> str:
    """List all schema names defined in a project."""
    data = await _get(f"/projects/{project_id}/schema/")
    return _dump({"schema_names": data.get("_schema_names", [])})


@mcp.tool()
async def get_schema(project_id: str, schema_name: str) -> str:
    """Get the field definitions for a named schema, including field types and defaults."""
    return _dump(await _get(f"/projects/{project_id}/schema/{schema_name}/"))


@mcp.tool()
async def create_schema_field(
    project_id: str,
    schema_name: str,
    field_name: str,
    field_type: str,
    index: int = 1,
    display_name: bool = False,
) -> str:
    """
    Add a field to a schema (creating the schema itself the first time a
    field references it). field_type is e.g. 'String', 'Number', 'Boolean',
    'RichText', 'ReferenceDocument'. Set display_name=True to make this
    field the one shown as a document's label in lists.
    """
    return _dump(
        await _post(
            f"/projects/{project_id}/schema/",
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
async def delete_schema_field(project_id: str, field_id: str) -> str:
    """Delete a schema field by its id (from create_schema_field's response or get_schema)."""
    await _delete(f"/projects/{project_id}/schema/{field_id}/")
    return _dump({"deleted": field_id})


# ── Collections ───────────────────────────────────────────────────────────────


@mcp.tool()
async def list_collections(project_id: str) -> str:
    """List all collections in a project with their schema associations."""
    data = await _get(f"/projects/{project_id}/collections/")
    return _dump(data.get("_schema_collections", []))


@mcp.tool()
async def create_collection(project_id: str, collection_name: str, schema_name: str) -> str:
    """
    Create a collection backed by an existing schema (create its fields
    with create_schema_field first). Documents are then written into this
    collection via create_document.
    """
    return _dump(
        await _post(
            f"/projects/{project_id}/collections/",
            data={"_index": 1, "_collection_name": collection_name, "_schema_name": schema_name},
        )
    )


@mcp.tool()
async def delete_collection(project_id: str, collection_id: str) -> str:
    """
    Permanently delete a collection and its documents across every
    workspace. Irreversible.
    """
    await _delete(f"/projects/{project_id}/collections/{collection_id}/")
    return _dump({"deleted": collection_id})


# ── Documents ─────────────────────────────────────────────────────────────────


@mcp.tool()
async def list_documents(project_id: str, workspace_name: str, collection_name: str) -> str:
    """
    List all documents in a collection.
    Returns document IDs, their display labels, and publish statuses (draft/published).
    """
    data = await _get(
        f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/"
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
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    depth: int = 3,
) -> str:
    """
    Fetch a single document with referenced documents inlined.
    depth controls how many levels of ReferenceDocument fields are resolved (default 3).
    """
    return _dump(
        await _get(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            params={"depth": depth},
        )
    )


@mcp.tool()
async def create_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    data: dict,
) -> str:
    """
    Create a new document in a collection.
    data keys must match the collection's schema field names.
    New documents default to _status='draft'. Production workspace is read-only.
    """
    return _dump(
        await _post(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/",
            data=data,
        )
    )


@mcp.tool()
async def update_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    data: dict,
) -> str:
    """
    Update fields on an existing document. Only include keys you want to change.
    The previous state is automatically saved as a version before the update is applied.
    Production workspace is read-only.
    """
    return _dump(
        await _put(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            data=data,
        )
    )


@mcp.tool()
async def update_document_status(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    status: str,
) -> str:
    """
    Change a document's publish status. status must be 'draft' or 'published'.
    Production workspace is read-only.
    """
    return _dump(
        await _patch(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/",
            data={"_status": status},
        )
    )


@mcp.tool()
async def delete_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
) -> str:
    """
    Permanently delete a document from a collection.
    Production workspace is read-only.
    """
    await _delete(
        f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
    )
    return _dump({"deleted": document_id})


# ── Realtime Database ─────────────────────────────────────────────────────────


@mcp.tool()
async def rtdb_get(project_id: str, path: str = "") -> str:
    """
    Read a node (or the whole tree if path is empty) from a project's Realtime Database.
    path is a '/'-delimited key path, e.g. 'settings/homepage'.
    """
    return _dump(await _get(f"/projects/{project_id}/rtdb/{path}"))


@mcp.tool()
async def rtdb_set(project_id: str, path: str, value: Any) -> str:
    """
    Overwrite the node at path with value (any JSON-serializable data).
    An empty path targets the tree root.
    """
    return _dump(await _put(f"/projects/{project_id}/rtdb/{path}", data=value))


@mcp.tool()
async def rtdb_update(project_id: str, path: str, value: dict) -> str:
    """Shallow-merge value (a JSON object) into the existing node at path."""
    return _dump(await _patch(f"/projects/{project_id}/rtdb/{path}", data=value))


@mcp.tool()
async def rtdb_delete(project_id: str, path: str = "") -> str:
    """Delete the node at path (or the entire tree if path is empty). Irreversible."""
    await _delete(f"/projects/{project_id}/rtdb/{path}")
    return _dump({"deleted": path or "/"})


if __name__ == "__main__":
    mcp.run()
