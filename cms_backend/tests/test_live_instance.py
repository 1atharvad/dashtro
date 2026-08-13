"""
Opt-in tests against a real, already-deployed Dashtro instance (e.g. the
Render staging environment described in render.yaml), exercised entirely
through the API-key surface — no JWT, no in-process TestClient, no mocking.
Every other test in this suite proves the code is correct against an
in-process app instance; these prove the same behavior holds end-to-end
against a real deployed process, database, and network round trip.

Skipped entirely unless both LIVE_CMS_BASE_URL and LIVE_CMS_API_KEY are set
(e.g. `LIVE_CMS_BASE_URL=https://dashtro-staging.onrender.com
LIVE_CMS_API_KEY=... pytest cms_backend/tests/test_live_instance.py`) — never
runs in CI or a normal local `pytest` invocation, since it needs real
credentials and talks to the network. The API key must be unscoped (no
project_id bound to it) since test_live_project_lifecycle exercises
create_project, which only an unscoped key is allowed to do.

Every test uses the `live_project` fixture, which creates a fresh scratch
project through create_project and always deletes it again in a `finally`
block — delete_project cascades across schema/collections/documents, so a
single teardown call is enough to leave the live instance exactly as clean
as it was before the test ran, even if an assertion fails partway through.
"""

import os
import uuid

import httpx
import pytest

BASE_URL = os.environ.get("LIVE_CMS_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("LIVE_CMS_API_KEY", "")

pytestmark = pytest.mark.skipif(
    not BASE_URL or not API_KEY,
    reason="set LIVE_CMS_BASE_URL and LIVE_CMS_API_KEY to run against a real deployed instance",
)


@pytest.fixture
def live_client():
    """An httpx client pointed at the live instance's API-key surface, sending X-API-Key on every request."""
    with httpx.Client(
        base_url=f"{BASE_URL}/api/sdk", headers={"X-API-Key": API_KEY}, timeout=30
    ) as client:
        yield client


@pytest.fixture
def live_project(live_client):
    """
    Creates a scratch project on the live instance (via the unscoped API
    key's create_project access) and always deletes it afterward, so this
    suite is safe to run repeatedly against a shared staging instance
    without accumulating junk projects — regardless of whether the test
    using this fixture passes or fails.
    """
    name = f"live-test-{uuid.uuid4().hex[:8]}"
    resp = live_client.post("/projects/", json={"name": name})
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["_id"]
    try:
        yield project_id
    finally:
        live_client.delete(f"/projects/{project_id}/")


def test_live_health():
    """
    Sanity check that the deployed instance is actually reachable before
    trusting any of the other live tests' results — if this fails, every
    other failure in this file is noise, not a real regression.
    """
    resp = httpx.get(f"{BASE_URL}/health", timeout=30)
    assert resp.status_code == 200, resp.text


def test_live_project_lifecycle(live_client):
    """
    Full create -> update -> delete lifecycle for a project through the
    live instance's API-key surface, run directly (not via the
    live_project fixture) since this test deletes the project itself as
    part of what it's verifying, rather than relying on fixture teardown.
    Confirms create_project returns a real, usable project id and that
    update_project's rename is reflected in its own response.
    """
    name = f"live-test-{uuid.uuid4().hex[:8]}"
    create_resp = live_client.post("/projects/", json={"name": name})
    assert create_resp.status_code == 201, create_resp.text
    project_id = create_resp.json()["_id"]

    try:
        update_resp = live_client.put(f"/projects/{project_id}/", json={"name": f"{name}-renamed"})
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["name"] == f"{name}-renamed"
    finally:
        delete_resp = live_client.delete(f"/projects/{project_id}/")
        assert delete_resp.status_code == 204, delete_resp.text


def test_live_schema_field_crud(live_client, live_project):
    """
    Create, update, and delete a schema field against the live instance —
    the same three operations the dashtro CLI's HTTP-mode schema import
    relies on, now proven against a real deployed backend/database rather
    than the in-process ASGITransport client the other CLI tests use.
    """
    create_resp = live_client.post(
        f"/projects/{live_project}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
    )
    assert create_resp.status_code == 200, create_resp.text
    field_id = create_resp.json()["_id"]

    update_resp = live_client.put(
        f"/projects/{live_project}/schema/{field_id}/",
        json={
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_schema_name": "Post",
            "_description": "The post title",
        },
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["_description"] == "The post title"

    delete_resp = live_client.delete(f"/projects/{live_project}/schema/{field_id}/")
    assert delete_resp.status_code == 200, delete_resp.text


def test_live_collection_and_document_crud(live_client, live_project):
    """
    End-to-end lifecycle for a workspace, a collection, and a document
    inside it: create_project's auto-created "production" workspace is
    intentionally read-only for direct document writes (push-to-production
    is the only way content reaches it), so this creates its own scratch
    workspace via create_workspace first, then creates the backing schema
    field, creates the collection, writes a document into that workspace,
    reads it back, updates it, then deletes the collection (which should
    take the document with it) — verified by re-listing collections and
    confirming it's gone.
    """
    create_ws_resp = live_client.post(
        f"/projects/{live_project}/workspaces/", json={"workspace_name": "staging"}
    )
    assert create_ws_resp.status_code == 201, create_ws_resp.text

    live_client.post(
        f"/projects/{live_project}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
    )

    create_coll_resp = live_client.post(
        f"/projects/{live_project}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
    )
    assert create_coll_resp.status_code == 200, create_coll_resp.text
    collection_id = create_coll_resp.json()["_id"]

    doc_id = uuid.uuid4().hex[:12]
    create_doc_resp = live_client.post(
        f"/projects/{live_project}/workspace/staging/collection/posts/",
        json={"_id": doc_id, "title": "Hello from the live suite"},
    )
    assert create_doc_resp.status_code == 201, create_doc_resp.text

    get_doc_resp = live_client.get(
        f"/projects/{live_project}/workspace/staging/collection/posts/document/{doc_id}/"
    )
    assert get_doc_resp.status_code == 200, get_doc_resp.text
    assert get_doc_resp.json()["title"] == "Hello from the live suite"

    update_doc_resp = live_client.put(
        f"/projects/{live_project}/workspace/staging/collection/posts/document/{doc_id}/",
        json={"title": "Updated"},
    )
    assert update_doc_resp.status_code == 200, update_doc_resp.text

    delete_coll_resp = live_client.delete(f"/projects/{live_project}/collections/{collection_id}/")
    assert delete_coll_resp.status_code == 204, delete_coll_resp.text

    list_resp = live_client.get(f"/projects/{live_project}/collections/")
    assert list_resp.json()["_schema_collections"] == []


def test_live_rtdb_crud(live_client, live_project):
    """
    Set, read, patch, and delete a value in the live instance's realtime
    database — the fourth data surface (alongside schema, collections, and
    documents) both MCP servers expose, proven end-to-end here the same
    way the others are.
    """
    set_resp = live_client.put(f"/projects/{live_project}/rtdb/live-test/", json={"count": 1})
    assert set_resp.status_code == 200, set_resp.text

    get_resp = live_client.get(f"/projects/{live_project}/rtdb/live-test/")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["count"] == 1

    patch_resp = live_client.patch(f"/projects/{live_project}/rtdb/live-test/", json={"count": 2})
    assert patch_resp.status_code == 200, patch_resp.text
    assert live_client.get(f"/projects/{live_project}/rtdb/live-test/").json()["count"] == 2

    delete_resp = live_client.delete(f"/projects/{live_project}/rtdb/live-test/")
    assert delete_resp.status_code == 204, delete_resp.text
