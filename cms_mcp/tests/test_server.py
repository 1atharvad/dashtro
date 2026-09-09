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
        run(server.create_schema_field(project_id, "Post", "title", "String", display_name=True))
    )
    assert title_field["_name"] == "title"
    body_field = json.loads(run(server.create_schema_field(project_id, "Post", "body", "RichText")))
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
    sequence: create → list → get → update → delete, asserting on real
    response state after each step rather than just checking each call
    didn't raise.

    Publishing a document ('published' status) only ever happens as a side
    effect of pushing to production through the CMS UI — MCP has no
    push-to-production tool, and update_document_status is restricted to
    'draft' only (see test_update_document_status_rejects_published below)
    — so this lifecycle never reaches a published state.
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

    status = json.loads(run(server.update_document_status(pid, ws, coll, doc_id, "draft")))
    assert status["_status"] == "draft"

    run(server.delete_document(pid, ws, coll, doc_id))
    listed_after_delete = json.loads(run(server.list_documents(pid, ws, coll)))
    assert doc_id not in listed_after_delete["document_ids"]


def test_update_document_status_rejects_published(project):
    """
    update_document_status is restricted to 'draft' — 'published' is set
    exclusively by pushing to production (a JWT/UI-only action MCP doesn't
    expose), never directly through this tool. Rejected client-side by the
    tool's own check before any network call is made — see
    test_update_document_status_rejects_published_server_side below for
    proof the backend independently enforces the same rule.
    """
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]
    created = json.loads(run(server.create_document(pid, ws, coll, data={"title": "Hello"})))
    doc_id = created["_id"]

    with pytest.raises(ValueError):
        run(server.update_document_status(pid, ws, coll, doc_id, "published"))


def test_update_document_status_rejects_published_server_side(project):
    """
    The backend's own /status/ endpoint rejects 'published' independently of
    the MCP tool's client-side check — proven by calling it directly over
    HTTP, bypassing update_document_status's ValueError guard entirely.
    """
    pid, ws, coll = project["project_id"], project["workspace_name"], project["collection_name"]
    created = json.loads(run(server.create_document(pid, ws, coll, data={"title": "Hello"})))
    doc_id = created["_id"]

    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(
            server._patch(
                f"/projects/{pid}/workspace/{ws}/collection/{coll}/document/{doc_id}/status/",
                data={"_status": "published"},
            )
        )
    assert exc.value.response.status_code == 400


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


# ── Schema Field Validation Tests ──────────────────────────────────────────────


def test_create_schema_field_valid_types(mcp_env):
    """All valid field types should be accepted (with required conditional fields)."""
    pid = mcp_env["project_id"] if "project_id" in mcp_env else None
    # Create a project first
    proj = json.loads(run(server.create_project("ValidationTest")))
    pid = proj["_id"]

    valid_types = [
        "String",
        "Number",
        "Boolean",
        "Email",
        "Date",
        "DateTime",
        "Color",
        "RichText",
        "Textarea",
        "Image",
        "URL",
        "File",
        "ScrollLink",
        "NestedDocument",
        "ReferenceDocument",
    ]
    valid_names = [
        "field_one",
        "field_two",
        "field_three",
        "field_four",
        "field_five",
        "field_six",
        "field_seven",
        "field_eight",
        "field_nine",
        "field_ten",
        "field_eleven",
        "field_twelve",
        "field_thirteen",
        "field_fourteen",
        "field_fifteen",
    ]
    for i, ftype in enumerate(valid_types):
        kwargs = {}
        if ftype == "NestedDocument":
            kwargs["nested_schema"] = "ChildSchema"
        elif ftype == "ReferenceDocument":
            kwargs["reference_schema"] = ["authors"]
        result = json.loads(
            run(server.create_schema_field(pid, "TestSchema", valid_names[i], ftype, **kwargs))
        )
        assert result["_type"] == ftype


def test_create_schema_field_invalid_type(mcp_env):
    """Invalid field_type should be rejected by MCP before hitting backend."""
    proj = json.loads(run(server.create_project("ValidationTest2")))
    pid = proj["_id"]

    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "bad", "NotARealType"))
    assert "Invalid schema field" in str(exc.value)
    assert "NotARealType" in str(exc.value)


def test_create_schema_field_invalid_schema_name(mcp_env):
    """schema_name must be PascalCase without numbers."""
    proj = json.loads(run(server.create_project("ValidationTest3")))
    pid = proj["_id"]

    for bad_name in ["badname", "BadName123", "bad_name", "123Bad"]:
        with pytest.raises(ValueError) as exc:
            run(server.create_schema_field(pid, bad_name, "field", "String"))
        assert "PascalCase" in str(exc.value)


def test_create_schema_field_invalid_field_name(mcp_env):
    """field_name must be snake_case without numbers."""
    proj = json.loads(run(server.create_project("ValidationTest4")))
    pid = proj["_id"]

    for bad_name in ["BadName", "badName", "bad-name", "bad123", "123bad"]:
        with pytest.raises(ValueError) as exc:
            run(server.create_schema_field(pid, "Test", bad_name, "String"))
        assert "snake_case" in str(exc.value)


def test_create_schema_field_relation_only_for_relational(mcp_env):
    """relation only valid for ReferenceDocument or NestedDocument."""
    proj = json.loads(run(server.create_project("ValidationTest5")))
    pid = proj["_id"]

    # Should fail for String
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "String", relation="OneToMany"))
    assert "relation only valid for ReferenceDocument or NestedDocument" in str(exc.value)

    # Should work for ReferenceDocument (needs reference_schema)
    result = json.loads(
        run(
            server.create_schema_field(
                pid,
                "Test",
                "ref_field",
                "ReferenceDocument",
                relation="OneToMany",
                reference_schema=["authors"],
            )
        )
    )
    assert result["_relation"] == "OneToMany"

    # Should work for NestedDocument (needs nested_schema)
    result = json.loads(
        run(
            server.create_schema_field(
                pid,
                "Test",
                "nested_field",
                "NestedDocument",
                relation="OneToOne",
                nested_schema="Child",
            )
        )
    )
    assert result["_relation"] == "OneToOne"


def test_create_schema_field_default_value_restrictions(mcp_env):
    """default_value not allowed for certain types."""
    proj = json.loads(run(server.create_project("ValidationTest6")))
    pid = proj["_id"]

    # Should fail for ReferenceDocument
    with pytest.raises(ValueError) as exc:
        run(
            server.create_schema_field(pid, "Test", "field", "ReferenceDocument", default_value="x")
        )
    assert "default_value not supported" in str(exc.value)

    # Should fail for RichText
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "RichText", default_value="x"))
    assert "default_value not supported" in str(exc.value)

    # Should work for String
    result = json.loads(
        run(server.create_schema_field(pid, "Test", "field", "String", default_value="hello"))
    )
    assert result["_default_value"] == "hello"


def test_create_schema_field_placeholder_restrictions(mcp_env):
    """placeholder not allowed for certain types."""
    proj = json.loads(run(server.create_project("ValidationTest7")))
    pid = proj["_id"]

    # Should fail for Email
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "Email", placeholder="x"))
    assert "placeholder not supported" in str(exc.value)

    # Should fail for Boolean
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "Boolean", placeholder="x"))
    assert "placeholder not supported" in str(exc.value)

    # Should work for String
    result = json.loads(
        run(server.create_schema_field(pid, "Test", "field", "String", placeholder="enter text"))
    )
    assert result["_placeholder"] == "enter text"


def test_create_schema_field_nested_schema_required(mcp_env):
    """nested_schema required for NestedDocument."""
    proj = json.loads(run(server.create_project("ValidationTest8")))
    pid = proj["_id"]

    # Should fail without nested_schema
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "NestedDocument"))
    assert "nested_schema required for NestedDocument" in str(exc.value)

    # Should fail with invalid nested_schema format
    with pytest.raises(ValueError) as exc:
        run(
            server.create_schema_field(
                pid, "Test", "field", "NestedDocument", nested_schema="badname"
            )
        )
    assert "PascalCase" in str(exc.value)

    # Should work with valid nested_schema
    result = json.loads(
        run(
            server.create_schema_field(
                pid, "Test", "field", "NestedDocument", nested_schema="ChildSchema"
            )
        )
    )
    assert result["_nested_schema"] == "ChildSchema"


def test_create_schema_field_reference_schema_required(mcp_env):
    """reference_schema required for ReferenceDocument."""
    proj = json.loads(run(server.create_project("ValidationTest9")))
    pid = proj["_id"]

    # Should fail without reference_schema
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "ReferenceDocument"))
    assert "reference_schema required" in str(exc.value)

    # Should fail with empty list
    with pytest.raises(ValueError) as exc:
        run(
            server.create_schema_field(
                pid, "Test", "field", "ReferenceDocument", reference_schema=[]
            )
        )
    assert "reference_schema required" in str(exc.value)

    # Should work with valid reference_schema
    result = json.loads(
        run(
            server.create_schema_field(
                pid, "Test", "field", "ReferenceDocument", reference_schema=["authors", "posts"]
            )
        )
    )
    assert result["_reference_schema"] == ["authors", "posts"]


def test_create_schema_field_rich_text_wrapper_only_for_richtext(mcp_env):
    """rich_text_wrapper only valid for RichText."""
    proj = json.loads(run(server.create_project("ValidationTest10")))
    pid = proj["_id"]

    # Should fail for String
    with pytest.raises(ValueError) as exc:
        run(server.create_schema_field(pid, "Test", "field", "String", rich_text_wrapper="Card"))
    assert "rich_text_wrapper only valid for RichText" in str(exc.value)

    # Should work for RichText
    result = json.loads(
        run(server.create_schema_field(pid, "Test", "field", "RichText", rich_text_wrapper="Card"))
    )
    assert result["_rich_text_wrapper"] == "Card"


def test_create_schema_field_auto_increments_index(mcp_env):
    """_index is always server-assigned on create (cms_backend/routers/
    sdk_schema.py) — the MCP tool doesn't even expose an index param, so
    there's no way for a caller to collide two fields on the same index via
    create; each successive field just gets the next index."""
    proj = json.loads(run(server.create_project("ValidationTest11")))
    pid = proj["_id"]

    field_one = json.loads(run(server.create_schema_field(pid, "Test", "field_one", "String")))
    assert field_one["_index"] == 1

    field_two = json.loads(run(server.create_schema_field(pid, "Test", "field_two", "String")))
    assert field_two["_index"] == 2


def test_create_schema_field_display_name_uniqueness(mcp_env):
    """Only one display_name per schema — enforced by the backend
    (cms_backend/routers/sdk_schema.py), not the MCP client, so this comes
    back as a 400 from the real HTTP round trip rather than a local
    pre-check."""
    proj = json.loads(run(server.create_project("ValidationTest12")))
    pid = proj["_id"]

    run(server.create_schema_field(pid, "Test", "field_one", "String", display_name=True))
    # Second field with display_name should fail
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(server.create_schema_field(pid, "Test", "field_two", "String", display_name=True))
    assert exc.value.response.status_code == 400
    assert "already has a display_name field" in str(exc.value)
