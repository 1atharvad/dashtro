"""
Integration tests for cms_mcp/server.py's MCP tools.

Each tool is exercised end-to-end: MCP tool → httpx → (via mcp_env's ASGI
transport patch) the real cms_backend FastAPI app → SQLite. No mocked HTTP
responses — a wrong path, method, or payload shape here fails the same way
it would against a real Dashtro instance.
"""

import asyncio
import json

import httpx
import pytest

import cms_mcp.server as server


def run(coro):
    """Drive a single MCP tool coroutine to completion (no pytest-asyncio dependency)."""
    return asyncio.run(coro)


def test_list_and_get_schema(project):
    """list_schema returns the seeded schema name; get_schema returns its field definitions."""
    listed = json.loads(run(server.list_schema(project["project_id"])))
    assert "Post" in listed["schema_names"]

    fields = json.loads(run(server.get_schema(project["project_id"], "Post")))
    assert any(f["_name"] == "title" for f in fields["Post"])


def test_list_collections(project):
    """list_collections returns the seeded collection with its schema association."""
    result = json.loads(run(server.list_collections(project["project_id"])))
    assert any(c["_collection_name"] == "posts" and c["_schema_name"] == "Post" for c in result)


def test_document_lifecycle(project):
    """create → list → get → update → publish → delete a document, checking state at each step."""
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]

    created = json.loads(run(server.create_document(pid, ws, coll, data={"title": "Hello"})))
    doc_id = created["_id"]
    assert created["title"] == "Hello"
    assert created["_status"] == "draft"

    listed = json.loads(run(server.list_documents(pid, ws, coll)))
    assert doc_id in listed["document_ids"]
    assert listed["document_statuses"][doc_id] == "draft"
    assert listed["document_labels"][doc_id] == "Hello"

    fetched = json.loads(run(server.get_document(pid, ws, coll, doc_id)))
    assert fetched["title"] == "Hello"

    updated = json.loads(
        run(server.update_document(pid, ws, coll, doc_id, data={"title": "Updated"}))
    )
    assert updated["title"] == "Updated"

    status = json.loads(run(server.update_document_status(pid, ws, coll, doc_id, "published")))
    assert status["_status"] == "published"
    listed_after_status = json.loads(run(server.list_documents(pid, ws, coll)))
    assert listed_after_status["document_statuses"][doc_id] == "published"

    run(server.delete_document(pid, ws, coll, doc_id))
    listed_after_delete = json.loads(run(server.list_documents(pid, ws, coll)))
    assert doc_id not in listed_after_delete["document_ids"]


def test_rtdb_crud(project):
    """set → get → merge-update → delete a realtime-database node."""
    pid = project["project_id"]

    run(server.rtdb_set(pid, "settings/homepage", {"title": "Home"}))
    fetched = json.loads(run(server.rtdb_get(pid, "settings/homepage")))
    assert fetched == {"title": "Home"}

    run(server.rtdb_update(pid, "settings/homepage", {"subtitle": "Welcome"}))
    merged = json.loads(run(server.rtdb_get(pid, "settings/homepage")))
    assert merged == {"title": "Home", "subtitle": "Welcome"}

    run(server.rtdb_delete(pid, "settings/homepage"))
    emptied = json.loads(run(server.rtdb_get(pid, "settings/homepage")))
    assert emptied in (None, {})


def test_get_document_404_bubbles_as_http_error(project):
    """A nonexistent document raises httpx.HTTPStatusError rather than returning null/empty."""
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]
    with pytest.raises(httpx.HTTPStatusError):
        run(server.get_document(pid, ws, coll, "does-not-exist"))


def test_tools_use_api_key_not_jwt(project, monkeypatch):
    """The whole point of this server is API-key auth — a JWT in CMS_API_KEY's
    place must be rejected the same as it would for any external SDK caller."""
    pid = project["project_id"]

    monkeypatch.setattr(server, "CMS_API_KEY", "")
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        run(server.list_schema(pid))
    assert exc_info.value.response.status_code == 401

    monkeypatch.setattr(server, "CMS_API_KEY", "not-a-real-key")
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        run(server.list_schema(pid))
    assert exc_info.value.response.status_code == 401
