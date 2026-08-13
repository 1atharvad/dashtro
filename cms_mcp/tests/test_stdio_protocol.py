"""
Proves cms_mcp/server.py works over the real MCP stdio/JSON-RPC transport,
not just as directly-callable Python functions the way test_server.py's
tests exercise it. Runs entirely locally (no staging URL, no API key
pasted into chat, no AI involvement) via `pytest` / `npm run test`, so this
same proof is repeatable in CI and by anyone who checks out the repo —
earlier in this project's history that proof only existed as one-off
scripts run by hand against a live deployed instance, which is real but not
reproducible or checked in anywhere.

Launches `cms_mcp/server.py` as an actual subprocess (mcp.client.stdio),
pointed at a real cms_backend server on a real socket (the `live_server`
fixture) — so this exercises tool discovery, JSON-RPC request/response
framing, and stdio piping for real, on top of the same HTTP calls
test_server.py already verifies against an in-process app.

The tool-call payloads (project name, schema field, etc.) are static data
with no behavior of their own, so they live in fixtures/authoring_lifecycle.json
rather than as inline literals here.
"""

import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

CMS_MCP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

with open(os.path.join(FIXTURES_DIR, "authoring_lifecycle.json")) as f:
    LIFECYCLE_DATA = json.load(f)


def run(coro):
    """Drive a single async MCP-client interaction to completion (no pytest-asyncio dependency)."""
    return asyncio.run(coro)


async def _authoring_lifecycle(base_url: str, api_key: str) -> dict:
    """Launch server.py as a subprocess and drive a full authoring lifecycle over real JSON-RPC."""
    params = StdioServerParameters(
        command=sys.executable,
        args=["server.py"],
        cwd=CMS_MCP_DIR,
        env={
            **os.environ,
            "CMS_API_URL": f"{base_url}/api/sdk",
            "CMS_API_KEY": api_key,
        },
    )

    results = {}
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            results["tool_names"] = sorted(t.name for t in tools.tools)

            proj = await session.call_tool("create_project", LIFECYCLE_DATA["project"])
            project = json.loads(proj.content[0].text)
            project_id = project["_id"]
            results["project"] = project

            ws = await session.call_tool(
                "create_workspace",
                {"project_id": project_id, **LIFECYCLE_DATA["workspace"]},
            )
            results["workspace"] = json.loads(ws.content[0].text)

            field = await session.call_tool(
                "create_schema_field",
                {"project_id": project_id, **LIFECYCLE_DATA["schema_field"]},
            )
            results["field"] = json.loads(field.content[0].text)

            coll = await session.call_tool(
                "create_collection",
                {"project_id": project_id, **LIFECYCLE_DATA["collection"]},
            )
            collection = json.loads(coll.content[0].text)
            results["collection"] = collection

            doc = await session.call_tool(
                "create_document",
                {
                    "project_id": project_id,
                    "workspace_name": LIFECYCLE_DATA["workspace"]["workspace_name"],
                    "collection_name": LIFECYCLE_DATA["collection"]["collection_name"],
                    "data": LIFECYCLE_DATA["document"],
                },
            )
            results["document"] = json.loads(doc.content[0].text)

            listed = await session.call_tool(
                "list_documents",
                {
                    "project_id": project_id,
                    "workspace_name": LIFECYCLE_DATA["workspace"]["workspace_name"],
                    "collection_name": LIFECYCLE_DATA["collection"]["collection_name"],
                },
            )
            results["listed_documents"] = json.loads(listed.content[0].text)

            deleted = await session.call_tool("delete_project", {"project_id": project_id})
            results["deleted"] = json.loads(deleted.content[0].text)

    return results


def test_full_authoring_lifecycle_over_real_stdio_protocol(live_server):
    """
    End-to-end: spawn the real dashtro-mcp server binary-equivalent
    (`python server.py`, exactly what a configured MCP client like Claude
    Desktop/Code would run), speak real MCP JSON-RPC to it over stdio, and
    walk it through create_project -> create_workspace ->
    create_schema_field -> create_collection -> create_document ->
    list_documents -> delete_project.

    Every assertion checks the actual real response content (not just "the
    call didn't raise"), and delete_project at the end proves the whole
    chain both worked and is safe to tear down through the same protocol
    that created it — no manual cleanup step, no leftover state between
    test runs.
    """
    results = run(_authoring_lifecycle(live_server["base_url"], live_server["api_key"]))

    assert "create_project" in results["tool_names"]
    assert "create_workspace" in results["tool_names"]
    assert "create_schema_field" in results["tool_names"]
    assert "create_collection" in results["tool_names"]
    assert "create_document" in results["tool_names"]
    assert "delete_project" in results["tool_names"]

    assert results["project"]["name"] == LIFECYCLE_DATA["project"]["name"]
    project_id = results["project"]["_id"]

    assert results["workspace"] == {
        "workspace_name": LIFECYCLE_DATA["workspace"]["workspace_name"],
        "is_production": False,
        "created_at": results["workspace"]["created_at"],
    }

    assert results["field"]["_name"] == LIFECYCLE_DATA["schema_field"]["field_name"]
    assert results["field"]["_schema_name"] == LIFECYCLE_DATA["schema_field"]["schema_name"]

    assert (
        results["collection"]["_collection_name"] == LIFECYCLE_DATA["collection"]["collection_name"]
    )
    assert results["collection"]["_schema_name"] == LIFECYCLE_DATA["collection"]["schema_name"]

    assert results["document"]["title"] == LIFECYCLE_DATA["document"]["title"]
    assert results["document"]["_status"] == "draft"
    doc_id = results["document"]["_id"]

    assert doc_id in results["listed_documents"]["document_ids"]
    assert (
        results["listed_documents"]["document_labels"][doc_id]
        == LIFECYCLE_DATA["document"]["title"]
    )

    assert results["deleted"] == {"deleted": project_id}
