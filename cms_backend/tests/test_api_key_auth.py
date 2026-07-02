"""
Tests for SDK API-key auth (api/utils/api_key_auth.py), exercised through
real /api/sdk/ routes since `require_api_key` / `check_key_scope` are
FastAPI dependencies, not standalone-callable functions.

Note on scope: `check_key_scope(key_info, project_id, collection_name)` is
the *first* statement in every sdk_documents.py route body, executed before
`_resolve_collection` looks anything up in the database. That means the
403 scope-mismatch tests below don't need a real project/collection to
exist. The "valid key, in scope" tests do reach `_resolve_collection`
(since scope passed), which 404s for a nonexistent collection — that 404
still proves the request got *past* the API-key auth layer, which is all
this file is responsible for verifying; full CRUD behavior against real
project/collection data is out of scope here.
"""

SDK_COLLECTION_URL = "/api/sdk/projects/{project_id}/workspace/{workspace}/collection/{collection}/"


def _create_api_key(client, auth_headers, **overrides):
    """Create an API key via the authenticated CMS endpoint and return the
    raw secret key value plus the full key record.
    """
    body = {"label": "test key", "project_id": None, "collections": None, "scopes": ["read"]}
    body.update(overrides)
    resp = client.post("/api/cms/auth/api-keys/", json=body, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _sdk_url(project_id="proj-1", workspace="staging", collection="posts"):
    return SDK_COLLECTION_URL.format(project_id=project_id, workspace=workspace, collection=collection)


# ── Missing / invalid / revoked keys ────────────────────────────────────────


def test_missing_api_key_header_is_rejected(client):
    """No X-API-Key header at all on an SDK route → 401."""
    resp = client.get(_sdk_url())
    assert resp.status_code == 401
    assert resp.json()["detail"] == "X-API-Key header missing"


def test_unknown_api_key_is_rejected(client):
    """A well-formed but never-issued key value → 401."""
    resp = client.get(_sdk_url(), headers={"X-API-Key": "not-a-real-key"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid or revoked API key"


def test_revoked_api_key_is_rejected(client, auth_headers):
    """A key that has been explicitly revoked is treated the same as unknown."""
    key = _create_api_key(client, auth_headers, scopes=["read"])
    revoke_resp = client.patch(
        f"/api/cms/auth/api-keys/{key['id']}/revoke/", headers=auth_headers
    )
    assert revoke_resp.status_code == 200

    resp = client.get(_sdk_url(), headers={"X-API-Key": key["key"]})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid or revoked API key"


# ── Operation scope (read/write) ─────────────────────────────────────────────


def test_read_only_key_rejected_on_write_route(client, auth_headers):
    """A key with scopes=["read"] must not be usable on a write (POST) route."""
    key = _create_api_key(client, auth_headers, scopes=["read"])
    resp = client.post(
        _sdk_url(), json={"title": "hello"}, headers={"X-API-Key": key["key"]}
    )
    assert resp.status_code == 403
    assert "write" in resp.json()["detail"]


def test_read_key_accepted_on_read_route(client, auth_headers):
    """A key with the correct 'read' scope passes the auth layer (a 404 for
    the nonexistent collection is expected and fine — it proves the request
    got past `require_api_key`/`check_key_scope`).
    """
    key = _create_api_key(client, auth_headers, scopes=["read"])
    resp = client.get(_sdk_url(), headers={"X-API-Key": key["key"]})
    assert resp.status_code not in (401, 403)


def test_write_key_accepted_on_write_route(client, auth_headers):
    """A key with the 'write' scope passes the auth layer on a write route."""
    key = _create_api_key(client, auth_headers, scopes=["write"])
    resp = client.post(
        _sdk_url(), json={"title": "hello"}, headers={"X-API-Key": key["key"]}
    )
    assert resp.status_code not in (401, 403)


# ── Project / collection scoping (check_key_scope) ──────────────────────────


def test_key_scoped_to_project_rejected_for_other_project(client, auth_headers):
    """A key scoped to project 'proj-a' must be rejected against 'proj-b'."""
    key = _create_api_key(client, auth_headers, project_id="proj-a", scopes=["read"])
    resp = client.get(_sdk_url(project_id="proj-b"), headers={"X-API-Key": key["key"]})
    assert resp.status_code == 403
    assert "project" in resp.json()["detail"].lower()


def test_key_scoped_to_project_accepted_for_that_project(client, auth_headers):
    """The same key, used against the project it's actually scoped to, passes
    the scope check (a downstream 404 for the missing collection is fine).
    """
    key = _create_api_key(client, auth_headers, project_id="proj-a", scopes=["read"])
    resp = client.get(_sdk_url(project_id="proj-a"), headers={"X-API-Key": key["key"]})
    assert resp.status_code not in (401, 403)


def test_key_scoped_to_collection_rejected_for_other_collection(client, auth_headers):
    """A key scoped to collections=["posts"] must be rejected for 'pages'."""
    key = _create_api_key(client, auth_headers, collections=["posts"], scopes=["read"])
    resp = client.get(_sdk_url(collection="pages"), headers={"X-API-Key": key["key"]})
    assert resp.status_code == 403
    assert "collection" in resp.json()["detail"].lower()


def test_key_scoped_to_collection_accepted_for_that_collection(client, auth_headers):
    """The same key, used against its own collection, passes the scope check."""
    key = _create_api_key(client, auth_headers, collections=["posts"], scopes=["read"])
    resp = client.get(_sdk_url(collection="posts"), headers={"X-API-Key": key["key"]})
    assert resp.status_code not in (401, 403)


def test_unscoped_key_works_against_any_project_and_collection(client, auth_headers):
    """A key created with no project_id/collections restrictions is valid
    everywhere (only the operation scope still applies).
    """
    key = _create_api_key(client, auth_headers, project_id=None, collections=None, scopes=["read"])
    resp = client.get(
        _sdk_url(project_id="anything", collection="whatever"),
        headers={"X-API-Key": key["key"]},
    )
    assert resp.status_code not in (401, 403)


# ── last_used_at side effect ─────────────────────────────────────────────────


def test_successful_key_use_stamps_last_used_at(client, auth_headers):
    """A successful `verify_api_key` call should update the key's
    last_used_at timestamp, visible via the CMS key-listing endpoint.
    """
    key = _create_api_key(client, auth_headers, scopes=["read"])
    client.get(_sdk_url(), headers={"X-API-Key": key["key"]})

    listing = client.get("/api/cms/auth/api-keys/", headers=auth_headers)
    assert listing.status_code == 200
    updated = next(k for k in listing.json() if k["id"] == key["id"])
    assert updated["last_used_at"] is not None
