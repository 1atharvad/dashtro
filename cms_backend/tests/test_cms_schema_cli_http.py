"""
Round-trip tests for cms_schema.py's --base-url (HTTP/remote) commands —
the same `dashtro export/import ...` CLI, pointed at a real, running server
over a real socket instead of direct database access.

Runs an actual uvicorn server in a background thread (not TestClient/ASGI —
these commands use urllib against a URL, so they need a real socket to hit),
provisions an owner + unrestricted read/write API key through the live app,
then drives cms_schema.py's *_http commands against it exactly as an
external caller with `--base-url`/`--api-key` would.
"""

import socket
import sys
import threading
import time

import httpx
import pytest
import uvicorn

TEST_JWT_SECRET = "test-secret-key-not-for-production"


def _evict_cms_modules():
    """Drop cached imports of app/router/cms_schema modules so the next fixture's env vars take effect."""
    for name in list(sys.modules):
        if (
            name == "main"
            or name == "config"
            or name == "cms_backend.scripts.cms_schema"
            or name.startswith(("routers.", "routers", "api."))
        ):
            sys.modules.pop(name, None)


def _reset_db_singleton():
    """Clear the process-wide SqliteClient singleton so the next fixture gets its own fresh instance."""
    from api.utils.sqlite_client import SqliteClient

    SqliteClient._instance = None


def _free_port() -> int:
    """Ask the OS for an unused localhost port to bind the test uvicorn server to."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def live_server(tmp_path, monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("DEBUG", "False")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")
    monkeypatch.setenv("MEDIA_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("DB_TYPE", "sqlite")
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("CMS_UPLOAD_DIR", str(tmp_path / "uploads"))

    _evict_cms_modules()
    _reset_db_singleton()

    import main

    import cms_backend.scripts.cms_schema as cms_schema

    port = _free_port()
    config = uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started, "uvicorn server did not start in time"

    base_url = f"http://127.0.0.1:{port}"

    email, password = "owner@example.com", "correct-horse-battery-staple"
    with httpx.Client(base_url=base_url) as setup:
        signup = setup.post(
            "/api/cms/auth/signup/",
            json={"email": email, "password": password, "first_name": "Owner", "last_name": "User"},
        )
        assert signup.status_code == 200, signup.text
        login = setup.post("/api/cms/auth/login/", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        jwt_headers = {"Authorization": f"Bearer {login.json()['idToken']}"}

        key_resp = setup.post(
            "/api/cms/auth/api-keys/",
            json={
                "label": "cli-test-key",
                "project_id": None,
                "collections": None,
                "scopes": ["read", "write"],
            },
            headers=jwt_headers,
        )
        assert key_resp.status_code == 200, key_resp.text
        api_key = key_resp.json()["key"]

    yield {
        "cms_schema": cms_schema,
        "base_url": base_url,
        "api_key": api_key,
        "jwt_headers": jwt_headers,
    }

    server.should_exit = True
    thread.join(timeout=5)
    _reset_db_singleton()
    _evict_cms_modules()


def _seed_post_schema_via_api(base_url: str, jwt_headers: dict, project_id: str) -> None:
    """Create a project (name=project_id) with a 'Post' schema and 'posts' collection over the JWT-authenticated API. Returns the real project id."""
    with httpx.Client(base_url=base_url) as client:
        proj = client.post(
            "/api/cms/projects/",
            json={"name": project_id},
            headers=jwt_headers,
        )
        assert proj.status_code == 201, proj.text
        real_project_id = proj.json()["_id"]

        field = client.post(
            f"/api/cms/projects/{real_project_id}/schema/",
            json={
                "_index": 1,
                "_name": "title",
                "_type": "String",
                "_schema_name": "Post",
                "_display_name": True,
            },
            headers=jwt_headers,
        )
        assert field.status_code == 201, field.text

        coll = client.post(
            f"/api/cms/projects/{real_project_id}/collections/",
            json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
            headers=jwt_headers,
        )
        assert coll.status_code == 201, coll.text
    return real_project_id


def test_schema_export_import_http_round_trip(live_server, tmp_path):
    """
    `dashtro export/import schema --base-url` round-trips a schema +
    collection into a different project — the same scenario
    test_cms_schema_cli.py's direct-DB test covers, but here every call
    goes over a real socket to a real running uvicorn instance with a real
    API key, exercising the exact code path (urllib requests, X-API-Key
    auth, JSON bodies) an external `dashtro ... --base-url ...` invocation
    would use.

    This is also the test that caught two real backend bugs this session:
    routers/sdk_schema.py's get_schema_names crashing on every call
    (AttributeError from iterating a dict as a list), and
    /api/sdk/projects/{id}/collections/ having no POST/PUT at all, so
    import could never restore a collection. Both are fixed now, and this
    test would fail loudly again if either regressed.

    A second import into the *same* destination project (further down)
    forces the schema-field and collection writes through their PUT
    (update) branches instead of POST (create) — proving update_collection
    in particular, whose original version had no existence check,
    validation, or merge logic, now behaves correctly on a second pass
    rather than corrupting or duplicating state.
    """
    cms_schema = live_server["cms_schema"]
    base_url, api_key = live_server["base_url"], live_server["api_key"]

    src_id = _seed_post_schema_via_api(base_url, live_server["jwt_headers"], "proj-src")
    backup_dir = tmp_path / "backup"

    cms_schema.cmd_export_http(base_url, src_id, backup_dir, api_key=api_key)
    assert (backup_dir / "schemas" / "Post.json").exists()

    # Import into a brand-new, schema-less project via the same HTTP surface.
    with httpx.Client(base_url=base_url) as client:
        dst = client.post(
            "/api/cms/projects/", json={"name": "proj-dst"}, headers=live_server["jwt_headers"]
        )
        assert dst.status_code == 201, dst.text
        dst_id = dst.json()["_id"]

    cms_schema.cmd_import_http(base_url, dst_id, backup_dir, api_key=api_key)

    with httpx.Client(base_url=base_url) as client:
        schema_resp = client.get(
            f"/api/sdk/projects/{dst_id}/schema/", headers={"X-API-Key": api_key}
        )
        assert schema_resp.status_code == 200, schema_resp.text
        assert schema_resp.json()["_schema_names"] == ["Post"]

        collections_resp = client.get(
            f"/api/sdk/projects/{dst_id}/collections/", headers={"X-API-Key": api_key}
        )
        assert collections_resp.status_code == 200, collections_resp.text
        names = {
            c["_collection_name"]: c["_schema_name"]
            for c in collections_resp.json()["_schema_collections"]
        }
        assert names == {"posts": "Post"}

    # Re-import the same backup into the same project: collections.py's
    # _import_collections now finds "posts" already exists and takes the PUT
    # (update_collection) branch instead of POST (create_collection) — proving
    # the update path works too, not just create.
    cms_schema.cmd_import_http(base_url, dst_id, backup_dir, api_key=api_key)

    with httpx.Client(base_url=base_url) as client:
        collections_resp = client.get(
            f"/api/sdk/projects/{dst_id}/collections/", headers={"X-API-Key": api_key}
        )
        assert collections_resp.status_code == 200, collections_resp.text
        collections = collections_resp.json()["_schema_collections"]
        assert (
            len(collections) == 1
        ), "re-import should update the existing collection, not duplicate it"
        assert collections[0]["_collection_name"] == "posts"
        assert collections[0]["_schema_name"] == "Post"


def test_documents_and_media_export_import_http_round_trip(live_server, tmp_path):
    """
    `dashtro export/import documents|media --base-url` against a real
    running server: a document (with an image field pointing at a real
    uploaded file) is exported, its referenced media is exported alongside
    it, and then both are re-imported into the *same* project without
    anything being deleted first — the update path, not just create.

    Uses a non-production workspace ("staging") since production is
    read-only for writes; creating the document directly in production
    would 403 before the test ever got to the export/import logic under
    test.
    """
    cms_schema = live_server["cms_schema"]
    base_url, api_key, jwt_headers = (
        live_server["base_url"],
        live_server["api_key"],
        live_server["jwt_headers"],
    )
    project_id = _seed_post_schema_via_api(base_url, jwt_headers, "proj-docs")
    workspace_name = "staging"

    with httpx.Client(base_url=base_url) as client:
        ws = client.post(
            f"/api/cms/projects/{project_id}/workspaces/",
            json={"workspace_name": workspace_name},
            headers=jwt_headers,
        )
        assert ws.status_code == 201, ws.text

        doc = client.post(
            f"/api/cms/projects/{project_id}/workspace/{workspace_name}/collection/posts/",
            json={"title": "Hello", "image": "/api/sdk/media/files/photo.png"},
            headers=jwt_headers,
        )
        assert doc.status_code == 201, doc.text
        doc_id = doc.json()["_id"]

    backup_dir = tmp_path / "backup"
    cms_schema.cmd_documents_export_http(
        base_url, project_id, workspace_name, backup_dir, api_key=api_key
    )
    assert (backup_dir / "documents" / "posts" / f"{doc_id}.json").exists()

    upload_dir = cms_schema._UPLOAD_DIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "photo.png").write_bytes(b"fake-png-bytes")
    cms_schema.cmd_media_export_http(base_url, backup_dir, api_key=api_key)
    assert (backup_dir / "media" / "photo.png").read_bytes() == b"fake-png-bytes"

    # Re-import both documents and media into the same project, proving the
    # backup round-trips even though nothing was deleted first (update path).
    cms_schema.cmd_documents_import_http(
        base_url, project_id, workspace_name, backup_dir, api_key=api_key
    )
    cms_schema.cmd_media_import_http(base_url, backup_dir, api_key=api_key)

    with httpx.Client(base_url=base_url) as client:
        resp = client.get(
            f"/api/cms/projects/{project_id}/workspace/{workspace_name}/collection/posts/document/{doc_id}/",
            headers=jwt_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["title"] == "Hello"
