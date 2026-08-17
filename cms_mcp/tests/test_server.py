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


def test_project_and_authoring_lifecycle(mcp_env):
    """
    The full authoring path an MCP client (Claude) actually needs to set up
    a project from nothing: create_project, create_workspace,
    create_schema_field (x2), create_collection, create_document, then tear
    it all down with delete_collection and delete_project — all driven
    through the MCP tools themselves rather than the JWT-authenticated
    fixture helpers `project` uses, since this is exactly the path that was
    missing before this session (the MCP server previously had no tools at
    all for creating a project, workspace, schema field, or collection —
    only for operating on ones that already existed).

    Uses mcp_env directly (not the `project` fixture) because create_project
    only works with an unscoped API key, and needs to be the one creating
    the project itself to prove the whole chain works end-to-end.
    """
    project = json.loads(run(server.create_project("Blog", "A demo blog")))
    project_id = project["_id"]
    assert project["name"] == "Blog"

    renamed = json.loads(run(server.update_project(project_id, "Renamed Blog", "Still a demo")))
    assert renamed["name"] == "Renamed Blog"

    ws = json.loads(run(server.create_workspace(project_id, "staging")))
    assert ws["workspace_name"] == "staging"

    title_field = json.loads(
        run(
            server.create_schema_field(
                project_id, "Post", "title", "String", index=1, display_name=True
            )
        )
    )
    assert title_field["_name"] == "title"
    body_field = json.loads(
        run(server.create_schema_field(project_id, "Post", "body", "RichText", index=2))
    )
    assert body_field["_name"] == "body"

    schema_names = json.loads(run(server.list_schema(project_id)))
    assert "Post" in schema_names["schema_names"]

    collection = json.loads(run(server.create_collection(project_id, "posts", "Post")))
    assert collection["_collection_name"] == "posts"

    doc = json.loads(
        run(
            server.create_document(
                project_id, "staging", "posts", data={"title": "Hello", "body": "World"}
            )
        )
    )
    assert doc["title"] == "Hello"

    run(server.delete_schema_field(project_id, body_field["_id"]))
    run(server.delete_collection(project_id, collection["_id"]))

    listed = json.loads(run(server.list_collections(project_id)))
    assert listed == []

    run(server.delete_project(project_id))
    # get_schema_names doesn't 404 on an unknown project_id (it just reads
    # whatever schema rows exist for that id, which is now none) — the real
    # proof delete_project cascaded is that the "Post" schema is gone too,
    # not just that this call didn't error.
    schema_after_delete = json.loads(run(server.list_schema(project_id)))
    assert schema_after_delete["schema_names"] == []


def test_list_and_get_schema(project):
    """
    list_schema should surface the 'Post' schema the `project` fixture
    seeded via the JWT-authenticated admin API, and get_schema should
    return its field definitions (here, the 'title' field) — proving the
    read-only schema tools correctly translate cms_backend's
    _schema_names/schema_jsonify response shapes into what the MCP tool
    hands back to a client.
    """
    listed = json.loads(run(server.list_schema(project["project_id"])))
    assert "Post" in listed["schema_names"]

    fields = json.loads(run(server.get_schema(project["project_id"], "Post")))
    assert any(f["_name"] == "title" for f in fields["Post"])


def test_list_collections(project):
    """
    list_collections should return the 'posts' collection the `project`
    fixture seeded, correctly associated with its 'Post' schema — the tool
    unwraps the backend's {"_schema_collections": [...]} envelope into a
    bare list, so this also guards against that unwrapping breaking.
    """
    result = json.loads(run(server.list_collections(project["project_id"], minimal=False)))
    assert any(c["_collection_name"] == "posts" and c["_schema_name"] == "Post" for c in result)


def test_document_lifecycle(project):
    """
    Drives every document-related MCP tool through a single realistic
    sequence: create → list → get → update → change status to published →
    delete, asserting on real response state after each step rather than
    just checking each call didn't raise.

    In particular, update_document_status here exercises the fix from this
    session: it now PATCHes /api/sdk/.../document/{id}/status/, the real
    purpose-built endpoint sdk_documents.py exposes, instead of the
    previous PUT-with-_status-in-body workaround that was needed only
    because the equivalent /api/cms/ PATCH endpoint never actually
    existed.
    """
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]

    created = json.loads(run(server.create_document(pid, ws, coll, data={"title": "Hello"})))
    doc_id = created["_id"]
    assert created["title"] == "Hello"
    assert created["_status"] == "draft"

    listed = json.loads(run(server.list_documents(pid, ws, coll, minimal=False)))
    assert doc_id in listed["document_ids"]
    assert listed["document_statuses"][doc_id] == "draft"
    assert listed["document_labels"][doc_id] == "Hello"

    fetched = json.loads(run(server.get_document(pid, ws, coll, doc_id, minimal=False)))
    assert fetched["title"] == "Hello"

    updated = json.loads(
        run(server.update_document(pid, ws, coll, doc_id, data={"title": "Updated"}))
    )
    assert updated["title"] == "Updated"

    status = json.loads(run(server.update_document_status(pid, ws, coll, doc_id, "published")))
    assert status["_status"] == "published"
    listed_after_status = json.loads(run(server.list_documents(pid, ws, coll, minimal=False)))
    assert listed_after_status["document_statuses"][doc_id] == "published"

    run(server.delete_document(pid, ws, coll, doc_id))
    listed_after_delete = json.loads(run(server.list_documents(pid, ws, coll)))
    assert doc_id not in listed_after_delete["document_ids"]


def test_rtdb_crud(project):
    """
    set → get → merge-update → delete against a single Realtime Database
    path. rtdb_update in particular should shallow-merge into the existing
    node (asserted by checking both the original 'title' key and the newly
    merged-in 'subtitle' key survive together) rather than replacing the
    whole node the way rtdb_set does.
    """
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
    """
    cms_mcp/server.py's HTTP helpers all call raise_for_status() — a 404
    from the backend should surface as httpx.HTTPStatusError out of the
    tool call, not silently return None/empty, since an MCP client (and
    the human on the other end of it) needs to be able to tell "document
    doesn't exist" apart from "document exists and is empty."
    """
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]
    with pytest.raises(httpx.HTTPStatusError):
        run(server.get_document(pid, ws, coll, "does-not-exist"))


def test_tools_use_api_key_not_jwt(project, monkeypatch):
    """
    The entire point of this session's auth migration was that MCP clients
    only ever get what an API key is scoped to, never a user's JWT — so
    this asserts the negative space directly: an empty CMS_API_KEY and an
    invalid one both get a real 401 from the backend's require_api_key
    dependency, the same as any other unauthenticated/misauthenticated
    /api/sdk/* caller would. `project` still seeded real data with a valid
    key beforehand (via mcp_env's JWT-authenticated setup calls), so a 401
    here can only mean the auth check itself is working, not that there's
    simply nothing to fetch.
    """
    pid = project["project_id"]

    monkeypatch.setattr(server, "CMS_API_KEY", "")
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        run(server.list_schema(pid))
    assert exc_info.value.response.status_code == 401

    monkeypatch.setattr(server, "CMS_API_KEY", "not-a-real-key")
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        run(server.list_schema(pid))
    assert exc_info.value.response.status_code == 401
