"""
Tests for routers/sdk_schema.py's write endpoints (schema fields, schema
categories, collections) — the API-key-authorized surface that
create_document/update_document/etc. in sdk_documents.py already had test
coverage for, but schema/collection writes here didn't: the only prior
coverage was indirect, through cms_schema.py's HTTP-mode CLI round-trip
test, which never asserted field-level content, never exercised
delete_schema_field or the category endpoints, and never checked audit
logging.

Every write here should land a row in cms_audit_logs with the API key as
actor (`apikey:{key id}`) — these tests check that directly via
GET /api/cms/audit-logs/, not just that the write itself succeeded.
"""


def _create_project(client, auth_headers, name="Blog"):
    resp = client.post("/api/cms/projects/", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["_id"]


def _create_api_key(client, auth_headers, **overrides):
    body = {
        "label": "test key",
        "project_id": None,
        "collections": None,
        "scopes": ["read", "write"],
    }
    body.update(overrides)
    resp = client.post("/api/cms/auth/api-keys/", json=body, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["key"]


def _audit_actions(client, auth_headers, project_id):
    """All audit log actions recorded for project_id, oldest first."""
    resp = client.get(
        "/api/cms/audit-logs/",
        params={"project_id": project_id, "limit": 500},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    logs = resp.json()["logs"]
    return [(log["action"], log["user_id"]) for log in reversed(logs)]


def test_schema_field_crud_and_audit_log(client, auth_headers):
    """
    Full lifecycle of a schema field through the API-key surface: create,
    then edit, then delete — the same three operations the `dashtro` CLI's
    HTTP-mode schema import relies on, but exercised directly here rather
    than through a round-trip that only checks the end state.

    Each step asserts on the actual response body (not just the status
    code), since a previous bug in this same file (get_schema_names
    crashing with AttributeError) would have been caught immediately by
    checking response content instead of just "did it 200".

    Also asserts that all three writes show up in cms_audit_logs with
    `apikey:{id}` as the actor — before this test, sdk_schema.py's write
    endpoints didn't call db_audit.log at all, so every API-key-driven
    schema edit was invisible to the audit trail.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)
    headers = {"X-API-Key": api_key}

    create_resp = client.post(
        f"/api/sdk/projects/{project_id}/schema/",
        json={
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_schema_name": "Post",
            "_display_name": True,
        },
        headers=headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    field = create_resp.json()
    assert field["_name"] == "title"
    field_id = field["_id"]

    update_resp = client.put(
        f"/api/sdk/projects/{project_id}/schema/{field_id}/",
        json={
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_schema_name": "Post",
            "_display_name": True,
            "_description": "The post title",
        },
        headers=headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["_description"] == "The post title"

    delete_resp = client.delete(
        f"/api/sdk/projects/{project_id}/schema/{field_id}/", headers=headers
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"success": True}

    actions = _audit_actions(client, auth_headers, project_id)
    action_names = [a for a, _ in actions]
    assert "create_schema_field" in action_names
    assert "update_schema_field" in action_names
    assert "delete_schema_field" in action_names
    for action, user_id in actions:
        if action in ("create_schema_field", "update_schema_field", "delete_schema_field"):
            assert user_id.startswith("apikey:")


def test_schema_category_create_and_assign_are_audit_logged(client, auth_headers):
    """
    Schema categories ("folders" in the UI) are a separate write path from
    schema fields — create_schema_category and update_schema_category_map
    are their own endpoints with their own audit actions (create_category,
    assign_category), so a passing test on schema-field writes alone
    wouldn't prove these are wired up too.

    Creates a category, then assigns the previously-seeded "Post" schema to
    it, and checks both actions land in the audit log.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)
    headers = {"X-API-Key": api_key}

    client.post(
        f"/api/sdk/projects/{project_id}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=headers,
    )

    cat_resp = client.post(
        f"/api/sdk/projects/{project_id}/schema-categories/", json={"name": "Blog"}, headers=headers
    )
    assert cat_resp.status_code == 200, cat_resp.text
    cat_id = cat_resp.json()["id"]

    map_resp = client.put(
        f"/api/sdk/projects/{project_id}/schema-category-map/Post/",
        json={"category_id": cat_id},
        headers=headers,
    )
    assert map_resp.status_code == 200, map_resp.text
    assert map_resp.json() == {"schema_name": "Post", "category_id": cat_id}

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "create_category" in action_names
    assert "assign_category" in action_names


def test_collection_create_requires_existing_schema(client, auth_headers):
    """
    create_collection must reject a _schema_name that doesn't exist yet in
    the project, the same way the JWT-authenticated
    routers/collections.py:create_collection already does — otherwise a
    collection could point at a schema that was never created, and every
    document write against it would have no field definitions to validate
    or default against.

    This check was missing from the original API-key create_collection
    (added in the same session as the auth-model migration); this test
    guards against it regressing.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)

    resp = client.post(
        f"/api/sdk/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "NoSuchSchema"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 400, resp.text


def test_collection_update_404s_on_unknown_id(client, auth_headers):
    """
    Regression test for a real bug a code-review pass caught in this same
    session: update_collection originally had no existence check at all,
    so PUT-ing an unknown collection_id would silently INSERT a new,
    half-populated collection row (via upsert_collection's INSERT-or-UPDATE
    semantics) instead of failing loudly. It's now a 404, matching the
    JWT-authenticated routers/collections.py:update_collection.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)

    resp = client.put(
        f"/api/sdk/projects/{project_id}/collections/does-not-exist/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 404, resp.text


def test_collection_create_and_update_and_audit_log(client, auth_headers):
    """
    Happy-path create-then-rename of a collection through the API-key
    surface, checking that update_collection actually merges into the
    existing record (via a GET afterward showing exactly one collection,
    not a duplicate or an orphaned second row) rather than the blind
    overwrite the pre-fix version did, and that both writes are
    audit-logged.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)
    headers = {"X-API-Key": api_key}

    client.post(
        f"/api/sdk/projects/{project_id}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=headers,
    )

    create_resp = client.post(
        f"/api/sdk/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers=headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    collection_id = create_resp.json()["_id"]

    update_resp = client.put(
        f"/api/sdk/projects/{project_id}/collections/{collection_id}/",
        json={"_index": 1, "_collection_name": "blog-posts", "_schema_name": "Post"},
        headers=headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["_collection_name"] == "blog-posts"

    list_resp = client.get(f"/api/sdk/projects/{project_id}/collections/", headers=headers)
    collections = list_resp.json()["_schema_collections"]
    assert len(collections) == 1
    assert collections[0]["_collection_name"] == "blog-posts"

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "create_collection" in action_names
    assert "update_collection" in action_names


def test_collection_delete_removes_it_and_its_documents(client, auth_headers):
    """
    delete_collection is the piece that makes the API-key surface usable
    for scratch/live testing without leaving permanent litter behind:
    without it, anything create_collection made could never be cleaned up
    through the same key that created it (only the JWT-authenticated admin
    UI could remove it). Checks the collection disappears from
    list_collections, a document written into it beforehand is gone too
    (delete_collection wipes documents across every workspace, not just
    the one the doc was created in), and the delete is audit-logged.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)
    headers = {"X-API-Key": api_key}

    client.post(
        f"/api/sdk/projects/{project_id}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=headers,
    )
    create_resp = client.post(
        f"/api/sdk/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers=headers,
    )
    collection_id = create_resp.json()["_id"]

    ws_resp = client.post(
        f"/api/cms/projects/{project_id}/workspaces/",
        json={"workspace_name": "staging"},
        headers=auth_headers,
    )
    assert ws_resp.status_code == 201, ws_resp.text

    doc_resp = client.post(
        f"/api/sdk/projects/{project_id}/workspace/staging/collection/posts/",
        json={"title": "Hello"},
        headers=headers,
    )
    assert doc_resp.status_code == 201, doc_resp.text

    delete_resp = client.delete(
        f"/api/sdk/projects/{project_id}/collections/{collection_id}/", headers=headers
    )
    assert delete_resp.status_code == 204, delete_resp.text

    list_resp = client.get(f"/api/sdk/projects/{project_id}/collections/", headers=headers)
    assert list_resp.json()["_schema_collections"] == []

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "delete_collection" in action_names


def test_collection_delete_404s_on_unknown_id(client, auth_headers):
    """delete_collection 404s on an unknown collection_id rather than silently no-op-ing."""
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)

    resp = client.delete(
        f"/api/sdk/projects/{project_id}/collections/does-not-exist/",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 404, resp.text


def test_project_create_via_unscoped_key_and_audit_log(client, auth_headers):
    """
    create_project is only meaningful for an unscoped key (one with no
    project_id bound to it) — a key already locked to a single project has
    no business minting a second one, so this exercises the happy path: an
    unscoped write key creates a project, gets back a fresh _id plus a
    "production" workspace (mirroring routers/projects.py's JWT-side
    create_project), and the write lands in the audit log with the API key
    as actor. A GET through the JWT admin surface afterward confirms the
    project is really there, not just that the response looked right.
    """
    api_key = _create_api_key(client, auth_headers)
    headers = {"X-API-Key": api_key}

    create_resp = client.post(
        "/api/sdk/projects/",
        json={"name": "New Blog", "description": "created via API key"},
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    project = create_resp.json()
    assert project["name"] == "New Blog"
    project_id = project["_id"]

    get_resp = client.get(f"/api/cms/projects/{project_id}/", headers=auth_headers)
    assert get_resp.status_code == 200, get_resp.text

    ws_resp = client.get(f"/api/cms/projects/{project_id}/workspaces/", headers=auth_headers)
    workspace_names = [ws["workspace_name"] for ws in ws_resp.json()]
    assert "production" in workspace_names

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "create_project" in action_names


def test_project_create_rejects_project_scoped_key(client, auth_headers):
    """
    A key already scoped to one project must not be usable to spin up an
    unrelated second project — create_project has no project_id in its URL
    to scope-check against, so it needs its own explicit guard
    (key_info.get("project_id")) rather than relying on check_key_scope.
    This is the regression test for that guard.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers, project_id=project_id)

    resp = client.post(
        "/api/sdk/projects/",
        json={"name": "Should Not Exist"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403, resp.text


def test_project_update_renames_it_and_is_audit_logged(client, auth_headers):
    """
    update_project is the third leg of full CRUD for projects through the
    API-key surface (create/update/delete). Renames a project, checks the
    new name is visible through the JWT-authenticated GET afterward (proof
    the write actually persisted, not just that the response echoed back
    what was sent), and checks the write is audit-logged as update_project
    with the API key as actor.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers, project_id=project_id)
    headers = {"X-API-Key": api_key}

    update_resp = client.put(
        f"/api/sdk/projects/{project_id}/",
        json={"name": "Renamed Blog", "description": "renamed via API key"},
        headers=headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["name"] == "Renamed Blog"

    get_resp = client.get(f"/api/cms/projects/{project_id}/", headers=auth_headers)
    assert get_resp.json()["name"] == "Renamed Blog"

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "update_project" in action_names


def test_project_update_404s_on_unknown_id(client, auth_headers):
    """update_project 404s on an unknown project_id rather than creating one under the radar."""
    api_key = _create_api_key(client, auth_headers)

    resp = client.put(
        "/api/sdk/projects/does-not-exist/",
        json={"name": "Ghost"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 404, resp.text


def test_project_update_rejects_key_scoped_to_other_project(client, auth_headers):
    """
    Same guard as test_project_delete_rejects_key_scoped_to_other_project,
    but for update_project: a key scoped to one project must not be able to
    rename a different project via check_key_scope's normal project_id
    check.
    """
    project_id = _create_project(client, auth_headers)
    other_project_id = _create_project(client, auth_headers, name="Other")
    api_key = _create_api_key(client, auth_headers, project_id=other_project_id)

    resp = client.put(
        f"/api/sdk/projects/{project_id}/",
        json={"name": "Hijacked"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403, resp.text


def test_workspace_create_and_audit_log(client, auth_headers):
    """
    create_workspace is what makes document writes reachable through the
    API-key surface at all: create_project's auto-created "production"
    workspace is intentionally read-only for direct writes
    (sdk_documents.py's _guard_production_write), so a key with no other
    way to make a non-production workspace could never write a document.
    Checks the new workspace shows up via the JWT-authenticated
    list_workspaces afterward and that the write is audit-logged.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers, project_id=project_id)

    create_resp = client.post(
        f"/api/sdk/projects/{project_id}/workspaces/",
        json={"workspace_name": "staging"},
        headers={"X-API-Key": api_key},
    )
    assert create_resp.status_code == 201, create_resp.text
    assert create_resp.json()["workspace_name"] == "staging"

    list_resp = client.get(f"/api/cms/projects/{project_id}/workspaces/", headers=auth_headers)
    workspace_names = [ws["workspace_name"] for ws in list_resp.json()]
    assert "staging" in workspace_names

    action_names = [a for a, _ in _audit_actions(client, auth_headers, project_id)]
    assert "create_workspace" in action_names


def test_workspace_create_rejects_duplicate_name(client, auth_headers):
    """create_workspace rejects a name that already exists, matching the JWT-side behavior."""
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers, project_id=project_id)
    headers = {"X-API-Key": api_key}

    first = client.post(
        f"/api/sdk/projects/{project_id}/workspaces/",
        json={"workspace_name": "staging"},
        headers=headers,
    )
    assert first.status_code == 201, first.text

    dupe = client.post(
        f"/api/sdk/projects/{project_id}/workspaces/",
        json={"workspace_name": "staging"},
        headers=headers,
    )
    assert dupe.status_code == 400, dupe.text


def test_workspace_create_404s_on_unknown_project(client, auth_headers):
    """create_workspace 404s when the project itself doesn't exist."""
    api_key = _create_api_key(client, auth_headers)

    resp = client.post(
        "/api/sdk/projects/does-not-exist/workspaces/",
        json={"workspace_name": "staging"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 404, resp.text


def test_workspace_create_rejects_key_scoped_to_other_project(client, auth_headers):
    """A key scoped to one project must not be able to create a workspace in a different project."""
    project_id = _create_project(client, auth_headers)
    other_project_id = _create_project(client, auth_headers, name="Other")
    api_key = _create_api_key(client, auth_headers, project_id=other_project_id)

    resp = client.post(
        f"/api/sdk/projects/{project_id}/workspaces/",
        json={"workspace_name": "staging"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403, resp.text


def test_project_delete_removes_it_and_is_audit_logged(client, auth_headers):
    """
    delete_project mirrors delete_collection: it's the piece that lets a
    project created through the API-key surface (e.g. by the dashtro CLI)
    also be torn down through that same key, instead of only via the
    JWT-authenticated admin UI. Checks the project disappears from
    GET /api/cms/projects/{id}/ and the delete is audit-logged with the
    API key as actor. Runs after the create/update tests above since
    delete is the terminal operation in a project's lifecycle — there's
    nothing left to test on a project once it's gone.
    """
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers, project_id=project_id)
    headers = {"X-API-Key": api_key}

    delete_resp = client.delete(f"/api/sdk/projects/{project_id}/", headers=headers)
    assert delete_resp.status_code == 204, delete_resp.text

    get_resp = client.get(f"/api/cms/projects/{project_id}/", headers=auth_headers)
    assert get_resp.status_code == 404, get_resp.text

    logs_resp = client.get(
        "/api/cms/audit-logs/",
        params={"project_id": project_id, "limit": 500},
        headers=auth_headers,
    )
    assert logs_resp.status_code == 200, logs_resp.text
    actions = [(log["action"], log["user_id"]) for log in logs_resp.json()["logs"]]
    delete_entries = [(a, u) for a, u in actions if a == "delete_project"]
    assert len(delete_entries) == 1
    assert delete_entries[0][1].startswith("apikey:")


def test_project_delete_404s_on_unknown_id(client, auth_headers):
    """delete_project 404s on an unknown project_id rather than silently no-op-ing."""
    api_key = _create_api_key(client, auth_headers)

    resp = client.delete(
        "/api/sdk/projects/does-not-exist/",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 404, resp.text


def test_project_delete_rejects_key_scoped_to_other_project(client, auth_headers):
    """
    A write-scoped API key locked to one project must not be able to delete
    a different project, the same way check_key_scope already blocks it
    from touching another project's schema or collections.
    """
    project_id = _create_project(client, auth_headers)
    other_project_id = _create_project(client, auth_headers, name="Other")
    api_key = _create_api_key(client, auth_headers, project_id=other_project_id)

    resp = client.delete(
        f"/api/sdk/projects/{project_id}/",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403, resp.text
