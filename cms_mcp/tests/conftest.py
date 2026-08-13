"""
Fixtures for cms_mcp/server.py's MCP tools.

Each tool is a plain `async def` (the `@mcp.tool()` decorator registers it
with FastMCP but returns the function unchanged), so tests call them
directly — `await server.list_projects()` — rather than going through the
MCP stdio/JSON-RPC protocol. Since pytest-asyncio isn't a dependency here,
tests are sync functions that drive coroutines with `asyncio.run()` (see the
`run()` helper in test_server.py); fixtures below do the same internally.

The tools talk to `CMS_API_URL` (/api/sdk/*, X-API-Key auth) over
`httpx.AsyncClient`. Instead of mocking that client, `mcp_env` below points
it at a real, in-process cms_backend FastAPI app via `httpx.ASGITransport` —
same "no fallbacks in tests" spirit as cms_backend/tests/conftest.py's
`client` fixture, just one layer further out. That means these tests
exercise the real request/response shapes the backend returns, not a
hand-maintained mock of them.

`mcp_env` signs up an owner via JWT auth, then mints an unrestricted (unscoped,
read+write) API key through the JWT-authenticated endpoint and patches
`cms_mcp.server.CMS_API_KEY` to it — exactly what the MCP tools use. The
`project` fixture below still provisions its fixture data via JWT for
speed/determinism, but the MCP tools themselves (create_project,
create_workspace, create_schema_field, create_collection, ...) are equally
capable of doing all of that through the API-key surface alone — see
test_project_and_authoring_lifecycle for a test that does exactly that.

SQLite only (mirrors the default backend test run) — no TEST_DB_TYPE toggle
here since these tests are about the MCP↔HTTP↔router contract, not the
storage backend.
"""

import asyncio
import socket
import sys
import threading
import time

import httpx
import pytest

TEST_JWT_SECRET = "test-secret-key-not-for-production"


def _evict_cms_modules():
    """Drop cached imports of app/router/config modules so the next fixture's env vars take effect."""
    for name in list(sys.modules):
        if name == "main" or name == "config" or name.startswith(("routers.", "routers", "api.")):
            sys.modules.pop(name, None)


def _reset_db_singleton():
    """Clear the process-wide SqliteClient singleton so the next fixture gets its own fresh instance."""
    from api.utils.sqlite_client import SqliteClient

    SqliteClient._instance = None


async def _signup_and_provision_api_key(transport: httpx.ASGITransport) -> dict:
    """Sign up an owner via JWT auth, then mint an unrestricted read+write API key as that owner."""
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        email, password = "owner@example.com", "correct-horse-battery-staple"
        signup = await client.post(
            "/api/cms/auth/signup/",
            json={"email": email, "password": password, "first_name": "Owner", "last_name": "User"},
        )
        assert signup.status_code == 200, signup.text
        login = await client.post(
            "/api/cms/auth/login/", json={"email": email, "password": password}
        )
        assert login.status_code == 200, login.text
        jwt_token = login.json()["idToken"]

        key_resp = await client.post(
            "/api/cms/auth/api-keys/",
            json={
                "label": "mcp-test-key",
                "project_id": None,
                "collections": None,
                "scopes": ["read", "write"],
            },
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        assert key_resp.status_code == 200, key_resp.text

    return {"jwt_token": jwt_token, "api_key": key_resp.json()["key"]}


@pytest.fixture
def mcp_env(tmp_path, monkeypatch):
    """Wires cms_mcp.server's HTTP calls to a fresh, isolated cms_backend app.

    Yields {"jwt_token", "api_key"} — tests use jwt_token for setup calls
    (creating projects/schema/collections, which require an authenticated
    CMS user) and api_key is what `cms_mcp.server.CMS_API_KEY` is patched
    to, so the MCP tools under test authenticate the same way a real client
    configured with that key would.
    """
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("DEBUG", "False")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")
    monkeypatch.setenv("MEDIA_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("DB_TYPE", "sqlite")
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.sqlite3"))

    _evict_cms_modules()
    _reset_db_singleton()

    import main

    import cms_mcp.server as mcp_server

    transport = httpx.ASGITransport(app=main.app)
    real_async_client = httpx.AsyncClient

    class ASGIBoundAsyncClient(real_async_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", ASGIBoundAsyncClient)
    monkeypatch.setattr(mcp_server, "CMS_API_URL", "http://testserver/api/sdk")

    creds = asyncio.run(_signup_and_provision_api_key(transport))
    monkeypatch.setattr(mcp_server, "CMS_API_KEY", creds["api_key"])

    yield creds

    _reset_db_singleton()
    _evict_cms_modules()


async def _create_project_fixture_data(jwt_token: str) -> dict:
    """Create a project with a 'staging' workspace, a 'Post' schema, and a 'posts' collection."""
    headers = {"Authorization": f"Bearer {jwt_token}"}
    async with httpx.AsyncClient(base_url="http://testserver") as client:
        proj = await client.post("/api/cms/projects/", json={"name": "Blog"}, headers=headers)
        assert proj.status_code == 201, proj.text
        project_id = proj.json()["_id"]

        ws = await client.post(
            f"/api/cms/projects/{project_id}/workspaces/",
            json={"workspace_name": "staging"},
            headers=headers,
        )
        assert ws.status_code == 201, ws.text

        field = await client.post(
            f"/api/cms/projects/{project_id}/schema/",
            json={
                "_index": 1,
                "_name": "title",
                "_type": "String",
                "_schema_name": "Post",
                "_display_name": True,
            },
            headers=headers,
        )
        assert field.status_code == 201, field.text

        coll = await client.post(
            f"/api/cms/projects/{project_id}/collections/",
            json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
            headers=headers,
        )
        assert coll.status_code == 201, coll.text

    return {"project_id": project_id, "workspace_name": "staging", "collection_name": "posts"}


def _free_port() -> int:
    """Ask the OS for an unused localhost port to bind the test uvicorn server to."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def live_server(tmp_path, monkeypatch):
    """A real cms_backend server on a real socket, for tests that launch an MCP
    server as an actual subprocess (test_stdio_protocol.py).

    Unlike `mcp_env`'s in-process ASGITransport patch, a subprocess can't
    share this process's Python objects — it needs a real, connectable
    CMS_API_URL. Mirrors cms_backend/tests/test_cms_schema_cli_http.py's
    `live_server` fixture (background uvicorn thread on a free port), kept
    as a separate copy here since pytest fixtures aren't shared across
    test-directory conftest.py files without an explicit plugin/import.

    Yields {"base_url", "api_key"} — api_key is an unscoped read+write key,
    minted through the real JWT-authenticated signup/login/api-keys flow.
    """
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("DEBUG", "False")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")
    monkeypatch.setenv("MEDIA_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("DB_TYPE", "sqlite")
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.sqlite3"))

    _evict_cms_modules()
    _reset_db_singleton()

    import main
    import uvicorn

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
    creds = asyncio.run(_signup_and_provision_api_key_http(base_url))

    yield {"base_url": base_url, "api_key": creds["api_key"]}

    server.should_exit = True
    thread.join(timeout=5)
    _reset_db_singleton()
    _evict_cms_modules()


async def _signup_and_provision_api_key_http(base_url: str) -> dict:
    """Same as _signup_and_provision_api_key, but over a real socket (base_url) instead of ASGITransport."""
    async with httpx.AsyncClient(base_url=base_url) as client:
        email, password = "owner@example.com", "correct-horse-battery-staple"
        signup = await client.post(
            "/api/cms/auth/signup/",
            json={"email": email, "password": password, "first_name": "Owner", "last_name": "User"},
        )
        assert signup.status_code == 200, signup.text
        login = await client.post(
            "/api/cms/auth/login/", json={"email": email, "password": password}
        )
        assert login.status_code == 200, login.text
        jwt_token = login.json()["idToken"]

        key_resp = await client.post(
            "/api/cms/auth/api-keys/",
            json={
                "label": "mcp-stdio-test-key",
                "project_id": None,
                "collections": None,
                "scopes": ["read", "write"],
            },
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        assert key_resp.status_code == 200, key_resp.text

    return {"jwt_token": jwt_token, "api_key": key_resp.json()["key"]}


@pytest.fixture
def project(mcp_env):
    """A project with a 'staging' workspace, a 'Post' schema, and a 'posts' collection.

    Note: `mcp_env`'s httpx.AsyncClient patch injects the ASGI transport
    regardless of base_url, so plain `httpx.AsyncClient(base_url=...)` calls
    here reach the same in-process app the MCP tools under test will.
    """
    return asyncio.run(_create_project_fixture_data(mcp_env["jwt_token"]))
