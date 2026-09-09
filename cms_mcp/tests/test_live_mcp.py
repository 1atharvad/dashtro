"""
Opt-in tests that drive the MCP tools themselves (server.create_project,
server.create_document, ...) against a real, already-deployed Dashtro
instance — the staging environment on Render described in render.yaml.

This is deliberately a separate suite from cms_backend/tests/test_live_instance.py:
that one proves the backend's /api/sdk HTTP surface is correct end-to-end;
this one proves the MCP server built on top of it is correct end-to-end —
that an MCP client (Claude, or any other agent) calling these exact tool
functions can go from nothing to a fully authored, published document and
back, against the real deployed backend/database, not an in-process
ASGITransport or a mock.

Skipped entirely unless both LIVE_CMS_BASE_URL and LIVE_CMS_API_KEY are set —
either as real env vars, or (easier for repeated local runs) as two lines in
a repo-root `.env.live` file (gitignored, separate from the normal `.env` so
staging credentials don't mix with local dev config — see
`.env.live.example`):
    LIVE_CMS_BASE_URL=https://dashtro-staging.onrender.com
    LIVE_CMS_API_KEY=...
A real env var of the same name always takes priority over `.env.live` if
both are set. Never runs in CI or a normal local `pytest` invocation — it
needs real credentials and talks to the network. The API key must be
unscoped (no project_id bound to it) since test_live_mcp_full_lifecycle
exercises create_project, which only an unscoped key is allowed to do.

Every test creates its own scratch project and always deletes it again in a
`finally` block (or via the `live_mcp_project` fixture's teardown) —
delete_project cascades across schema/collections/documents, so a single
teardown call is enough to leave staging exactly as clean as it was before
the test ran, even if an assertion fails partway through.
"""

import asyncio
import json
import os
import uuid
from pathlib import Path

import httpx
import pytest
from decouple import Config, RepositoryEnv

import cms_mcp.server as server

_LIVE_ENV_PATH = Path(__file__).resolve().parents[2] / ".env.live"


def _live_env(key: str) -> str:
    """A real env var wins if set; otherwise fall back to .env.live (repo
    root, gitignored) — kept separate from the main .env so these opt-in
    live-instance credentials don't mix with normal local dev config."""
    if key in os.environ:
        return os.environ[key]
    if _LIVE_ENV_PATH.exists():
        return Config(RepositoryEnv(str(_LIVE_ENV_PATH)))(key, default="")
    return ""


BASE_URL = _live_env("LIVE_CMS_BASE_URL").rstrip("/")
API_KEY = _live_env("LIVE_CMS_API_KEY")

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not BASE_URL or not API_KEY,
        reason="set LIVE_CMS_BASE_URL and LIVE_CMS_API_KEY to run against a real deployed instance",
    ),
]


def run(coro):
    """Drive a single MCP tool coroutine to completion (no pytest-asyncio dependency)."""
    return asyncio.run(coro)


@pytest.fixture
def live_mcp_env(monkeypatch):
    """Points cms_mcp.server's module-level HTTP config at the real staging
    instance — no ASGITransport patch, no mocking; the MCP tools under test
    make real network calls to a real deployed process.

    Also resets the module-level `_circuit_breaker` singleton: it's shared
    process-wide across every test that imports cms_mcp.server (including
    test_server.py in the same session), and this suite's validation tests
    deliberately trigger several consecutive real 400s — without a reset,
    leftover failure count from an earlier test could tip it into "open"
    and raise CircuitBreakerOpen instead of the HTTPStatusError being
    tested for.
    """
    monkeypatch.setattr(server, "CMS_API_URL", f"{BASE_URL}/api/sdk")
    monkeypatch.setattr(server, "CMS_API_KEY", API_KEY)
    monkeypatch.setattr(server, "CMS_PROJECT_ID", "")
    server._circuit_breaker.failure_count = 0
    server._circuit_breaker.state = "closed"


@pytest.fixture
def live_mcp_project(live_mcp_env):
    """Creates a scratch project on staging via the MCP create_project tool
    itself and always deletes it afterward (via delete_project), so this
    suite is safe to run repeatedly against a shared staging instance
    without accumulating junk projects — regardless of whether the test
    using this fixture passes or fails."""
    name = f"mcp-live-test-{uuid.uuid4().hex[:8]}"
    project = json.loads(run(server.create_project(name)))
    project_id = project["_id"]
    try:
        yield project_id
    finally:
        run(server.delete_project(project_id))


def test_live_mcp_full_lifecycle(live_mcp_env):
    """
    The complete authoring path an MCP client actually needs, driven
    entirely through the MCP tool functions against real staging: create a
    project, rename it, add a workspace, define a schema (two fields, one
    required+display_name), bind a collection to it, write a document,
    read it back, list it, update its data, publish it, delete it, then
    tear the whole project down — proving every step of "project creation
    to document update" actually works against a real deployed instance,
    not just the in-process test app.

    Manages its own project lifecycle (not via live_mcp_project) since
    delete_project itself is one of the things this test verifies.
    """
    name = f"mcp-live-test-{uuid.uuid4().hex[:8]}"
    project = json.loads(run(server.create_project(name, "MCP live lifecycle test")))
    project_id = project["_id"]

    try:
        renamed = json.loads(run(server.update_project(project_id, f"{name}-renamed")))
        assert renamed["name"] == f"{name}-renamed"

        ws = json.loads(run(server.create_workspace(project_id, "staging")))
        assert ws["workspace_name"] == "staging"

        title_field = json.loads(
            run(
                server.create_schema_field(
                    project_id,
                    "Post",
                    "title",
                    "String",
                    display_name=True,
                    required=True,
                )
            )
        )
        assert title_field["_name"] == "title"
        assert title_field["_index"] == 1

        body_field = json.loads(
            run(server.create_schema_field(project_id, "Post", "body", "RichText"))
        )
        assert body_field["_index"] == 2

        schema_names = json.loads(run(server.list_schema(project_id)))
        assert "Post" in schema_names["schema_names"]

        collection = json.loads(run(server.create_collection(project_id, "posts", "Post")))
        assert collection["_collection_name"] == "posts"

        doc = json.loads(
            run(
                server.create_document(
                    project_id,
                    "staging",
                    "posts",
                    data={"title": "Hello from the live MCP suite", "body": "First draft"},
                )
            )
        )
        doc_id = doc["_id"]
        assert doc["title"] == "Hello from the live MCP suite"
        assert doc["_status"] == "draft"

        fetched = json.loads(run(server.get_document(project_id, "staging", "posts", doc_id)))
        assert fetched["title"] == "Hello from the live MCP suite"

        listed = json.loads(run(server.list_documents(project_id, "staging", "posts")))
        assert doc_id in listed["document_ids"]

        updated = json.loads(
            run(
                server.update_document(
                    project_id, "staging", "posts", doc_id, data={"body": "Revised draft"}
                )
            )
        )
        assert updated["body"] == "Revised draft"
        assert updated["title"] == "Hello from the live MCP suite"

        # Publishing only ever happens as a side effect of pushing to
        # production through the CMS UI — MCP has no push-to-production
        # tool, and update_document_status is restricted to 'draft' only.
        reverted = json.loads(
            run(
                server.update_document_status(
                    project_id, "staging", "posts", doc_id, status="draft"
                )
            )
        )
        assert reverted["_status"] == "draft"

        # Rejected client-side by the tool's own check — never even reaches
        # the network, let alone real staging.
        with pytest.raises(ValueError):
            run(
                server.update_document_status(
                    project_id, "staging", "posts", doc_id, status="published"
                )
            )

        run(server.delete_document(project_id, "staging", "posts", doc_id))
        listed_after_delete = json.loads(run(server.list_documents(project_id, "staging", "posts")))
        assert doc_id not in listed_after_delete["document_ids"]

        run(server.delete_schema_field(project_id, body_field["_id"]))
        run(server.delete_collection(project_id, collection["_id"]))

        remaining_collections = json.loads(run(server.list_collections(project_id)))
        assert remaining_collections == []
    finally:
        run(server.delete_project(project_id))


def test_live_mcp_rejects_ai_slop_document_writes(live_mcp_project):
    """
    The core guarantee this session's "no AI slop" hardening is meant to
    provide, proven against the real deployed backend rather than the
    in-process test app: an MCP client cannot write a document field that
    doesn't exist on the schema, a value of the wrong shape/type, a
    system-owned key, or skip a required field — every one of these must
    come back as a real 400 from staging's own validation, not something
    the MCP client silently allowed through.
    """
    run(server.create_workspace(live_mcp_project, "staging"))
    run(
        server.create_schema_field(
            live_mcp_project, "Post", "title", "String", display_name=True, required=True
        )
    )
    run(server.create_collection(live_mcp_project, "posts", "Post"))

    # Unknown field not defined on the schema.
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(
            server.create_document(
                live_mcp_project, "staging", "posts", data={"title": "ok", "not_a_field": "x"}
            )
        )
    assert exc.value.response.status_code == 400

    # Missing a required field.
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(server.create_document(live_mcp_project, "staging", "posts", data={}))
    assert exc.value.response.status_code == 400

    # System-owned key smuggled into data.
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(
            server.create_document(
                live_mcp_project, "staging", "posts", data={"title": "ok", "_status": "published"}
            )
        )
    assert exc.value.response.status_code == 400

    # Wrong type for a String field.
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(server.create_document(live_mcp_project, "staging", "posts", data={"title": 12345}))
    assert exc.value.response.status_code == 400


def test_live_mcp_rejects_ai_slop_schema_fields(live_mcp_project):
    """
    Same guarantee, for schema-field definitions: an MCP client cannot
    invent a field type, skip a conditional field a type requires, or
    create a second display_name field on the same schema — every one of
    these must come back as a rejection from real staging.
    """
    # NestedDocument without nested_schema — rejected client-side by the
    # MCP's own Pydantic model before it ever reaches the network.
    with pytest.raises(ValueError):
        run(server.create_schema_field(live_mcp_project, "Post", "body", "NestedDocument"))

    # A genuinely invalid field_type isn't even representable — field_type
    # is typed as str, so send it straight through and let the real backend
    # reject it.
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(
            server._post(
                f"/projects/{live_mcp_project}/schema/",
                data={
                    "_name": "weird",
                    "_type": "TotallyMadeUpType",
                    "_schema_name": "Post",
                    "_display_name": False,
                    "_description": "",
                    "_required": False,
                },
            )
        )
    assert exc.value.response.status_code == 400

    # Duplicate display_name on the same schema.
    run(server.create_schema_field(live_mcp_project, "Post", "title", "String", display_name=True))
    with pytest.raises(httpx.HTTPStatusError) as exc:
        run(
            server.create_schema_field(
                live_mcp_project, "Post", "subtitle", "String", display_name=True
            )
        )
    assert exc.value.response.status_code == 400
    assert "already has a display_name field" in str(exc.value)
