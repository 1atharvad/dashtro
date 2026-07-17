"""
Shared pytest fixtures for the DashTro CMS backend test suite.

Why this file is more involved than a typical FastAPI conftest:
`SqliteClient` (api/utils/sqlite_client.py) is a process-wide singleton
(`__new__` caches `cls._instance`), and every router module instantiates its
own `SqliteAuth()` / `SqliteData()` client at *import time* (e.g.
`routers/auth.py`, `routers/documents.py`, `routers/sdk_documents.py`).
`config.py` also reads `DEBUG` / `CORS_ORIGINS` from the environment at
import time. That means:

  1. Env vars (SQLITE_DB_PATH, JWT_SECRET_KEY, DEBUG, CORS_ORIGINS) must be
     set *before* `main` or any `routers.*` / `config` module is imported.
  2. Because Python caches imported modules in `sys.modules`, those modules
     must be evicted before each test so the next test's env vars actually
     take effect, instead of silently reusing the previous test's cached
     singleton/config values.

Every test in this suite therefore goes through the `client` fixture below,
which pops the relevant modules, resets the `SqliteClient` singleton, sets
env vars for a fresh temp-file SQLite database, and only *then* imports
`main` and builds a `TestClient`.

Set `TEST_DB_TYPE=postgres` (with `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/
`DB_PASSWORD` pointing at a reachable Postgres) to run this same suite again
against `PostgresData`/`PostgresAuth` instead of SQLite, proving both data
backends satisfy the same router contract. Left unset, the suite runs
against SQLite only — no Postgres dependency for local/CI runs that don't
opt in.
"""

import os
import sys

import jwt
import pytest
from fastapi.testclient import TestClient

TEST_JWT_SECRET = "test-secret-key-not-for-production"
TEST_DB_TYPE = os.environ.get("TEST_DB_TYPE", "sqlite")

_POSTGRES_TABLES = (
    "cms_users",
    "cms_api_keys",
    "cms_projects",
    "cms_workspaces",
    "cms_project_schema",
    "cms_project_collections",
    "cms_project_workspace_data",
    "cms_schema_categories",
    "cms_schema_category_map",
    "cms_rich_text_components",
    "cms_project_rtdb",
    "cms_document_versions",
    "cms_audit_logs",
)


def _truncate_postgres_tables():
    """Wipe all cms_* tables between tests so Postgres runs get SQLite-tmp-file-like isolation."""
    import psycopg2
    from decouple import config

    conn = psycopg2.connect(
        host=config("DB_HOST", default="localhost"),
        port=config("DB_PORT", default="5432"),
        dbname=config("DB_NAME"),
        user=config("DB_USER"),
        password=config("DB_PASSWORD"),
    )
    try:
        with conn.cursor() as cursor:
            for table in _POSTGRES_TABLES:
                cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
        conn.commit()
    finally:
        conn.close()


def _evict_cms_modules():
    """Drop cached imports of app/router/config modules from sys.modules.

    Required so each test's env vars (and each test's fresh SqliteClient
    singleton) are actually picked up on the next `import main`, rather than
    reusing whatever a previous test already imported and cached.
    """
    for name in list(sys.modules):
        if name == "main" or name == "config" or name.startswith(("routers.", "routers", "api.")):
            sys.modules.pop(name, None)


def _reset_db_singletons():
    """Reset whichever backend's process-wide singleton(s) this run uses."""
    if TEST_DB_TYPE == "postgres":
        from api.utils.postgres_client import PostgresClient

        PostgresClient._instance = None
        from api.utils.postgres_audit_client import PostgresAuditClient

        PostgresAuditClient._instance = None
    else:
        from api.utils.sqlite_client import SqliteClient

        SqliteClient._instance = None


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A TestClient wired to a fresh, isolated database for a single test.

    Sets the env vars the app reads at import time, clears any previously
    imported app/router modules and the backend's singleton(s), then imports
    `main` fresh so this test gets its own database and its own in-process
    client instances. Backed by SQLite unless TEST_DB_TYPE=postgres is set.
    """
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("DEBUG", "False")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")
    monkeypatch.setenv("MEDIA_UPLOAD_DIR", str(tmp_path / "uploads"))

    if TEST_DB_TYPE == "postgres":
        monkeypatch.setenv("DB_TYPE", "postgres")
        _truncate_postgres_tables()
    else:
        monkeypatch.setenv("DB_TYPE", "sqlite")
        monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.sqlite3"))

    _evict_cms_modules()
    _reset_db_singletons()

    import main

    with TestClient(main.app) as test_client:
        yield test_client

    _reset_db_singletons()
    _evict_cms_modules()
    if TEST_DB_TYPE == "postgres":
        _truncate_postgres_tables()


@pytest.fixture
def debug_client(tmp_path, monkeypatch):
    """Same as `client`, but with DEBUG=True — exercises the documented
    auth-bypass path in CMSAuthMiddleware (`get_admin_token_id()` instead of
    verifying a real bearer token). Kept as a separate fixture so the bypass
    is only ever exercised by tests that explicitly opt into it.
    """
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    monkeypatch.setenv("DEBUG", "True")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost")
    monkeypatch.setenv("MEDIA_UPLOAD_DIR", str(tmp_path / "uploads"))

    if TEST_DB_TYPE == "postgres":
        monkeypatch.setenv("DB_TYPE", "postgres")
        _truncate_postgres_tables()
    else:
        monkeypatch.setenv("DB_TYPE", "sqlite")
        monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test_debug.sqlite3"))

    _evict_cms_modules()
    _reset_db_singletons()

    import main

    with TestClient(main.app) as test_client:
        yield test_client

    _reset_db_singletons()
    _evict_cms_modules()
    if TEST_DB_TYPE == "postgres":
        _truncate_postgres_tables()


@pytest.fixture
def signup_owner(client):
    """Create the first (Owner) user via the public signup route and log in.

    Returns a dict with the created user's id/email and the tokens from a
    follow-up login call, since /auth/signup/ itself doesn't return a JWT.
    """
    email = "owner@example.com"
    password = "correct-horse-battery-staple"
    signup_resp = client.post(
        "/api/cms/auth/signup/",
        json={"email": email, "password": password, "first_name": "Owner", "last_name": "User"},
    )
    assert signup_resp.status_code == 200, signup_resp.text

    login_resp = client.post(
        "/api/cms/auth/login/",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200, login_resp.text
    login_data = login_resp.json()

    return {
        "uid": signup_resp.json()["uid"],
        "email": email,
        "id_token": login_data["idToken"],
        "refresh_token": login_data["refreshToken"],
    }


@pytest.fixture
def auth_headers(signup_owner):
    """Bearer-auth header dict for the signed-up Owner user."""
    return {"Authorization": f"Bearer {signup_owner['id_token']}"}


def make_expired_token() -> str:
    """A JWT signed with the test secret whose `exp` claim is already in the past."""
    from datetime import UTC, datetime, timedelta

    now = datetime.now(tz=UTC)
    payload = {
        "uid": "some-uid",
        "email": "expired@example.com",
        "email_verified": True,
        "exp": now - timedelta(hours=1),
        "iat": now - timedelta(hours=2),
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")
