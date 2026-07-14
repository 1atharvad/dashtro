"""
DashTro CMS — MCP Server

Exposes the CMS REST API as MCP tools so Claude (or any MCP client) can
read and write content directly.

Configuration (env vars):
  CMS_API_URL  — base URL of the CMS backend, e.g. http://localhost:7312/api/cms
  CMS_TOKEN    — Bearer token for authenticated requests (omit in DEBUG mode)
"""

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

CMS_API_URL = os.environ.get("CMS_API_URL", "http://localhost:7312/api/cms")
CMS_TOKEN = os.environ.get("CMS_TOKEN", "")

mcp = FastMCP("DashTro CMS")


# ── HTTP helpers ──────────────────────────────────────────────────────────────


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if CMS_TOKEN:
        h["Authorization"] = f"Bearer {CMS_TOKEN}"
    return h


def _url(path: str) -> str:
    return f"{CMS_API_URL.rstrip('/')}{path}"


async def _get(path: str, params: dict | None = None) -> dict | list:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(_url(path), headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, data: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(_url(path), headers=_headers(), json=data or {})
        r.raise_for_status()
        return r.json()


async def _put(path: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.put(_url(path), headers=_headers(), json=data)
        r.raise_for_status()
        return r.json()


async def _patch(path: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.patch(_url(path), headers=_headers(), json=data)
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(_url(path), headers=_headers())
        r.raise_for_status()


def _dump(obj) -> str:
    return json.dumps(obj, indent=2, default=str)


# ── Projects ──────────────────────────────────────────────────────────────────


@mcp.tool()
async def list_projects() -> str:
    """List all CMS projects."""
    return _dump(await _get("/projects/"))


@mcp.tool()
async def list_workspaces(project_id: str) -> str:
    """List all workspaces for a project, including which one is production."""
    return _dump(await _get(f"/projects/{project_id}/workspaces/"))


@mcp.tool()
async def push_workspace_to_production(project_id: str, workspace_name: str) -> str:
    """Push a workspace's content to the production workspace. Irreversible — use with care."""
    return _dump(await _post(f"/projects/{project_id}/workspaces/{workspace_name}/push-to-prod/"))


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


# ── Collections ───────────────────────────────────────────────────────────────


@mcp.tool()
async def list_collections(project_id: str) -> str:
    """List all collections in a project with their schema associations."""
    data = await _get(f"/projects/{project_id}/collections/")
    return _dump(data.get("_schema_collections", []))


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


# ── Document versions ─────────────────────────────────────────────────────────


@mcp.tool()
async def list_document_versions(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
) -> str:
    """List all saved versions of a document (created automatically on each update)."""
    return _dump(
        await _get(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/"
        )
    )


@mcp.tool()
async def restore_document_version(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    version_id: str,
) -> str:
    """
    Restore a document to a previous version. The current state is saved as a new
    version before the restore so nothing is permanently lost.
    """
    return _dump(
        await _post(
            f"/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/{version_id}/restore/"
        )
    )


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
