---
name: adding-mcp-sdk-tool
description: Add a new tool exposed through cms-tool's SDK/MCP surface, keeping the backend endpoint, Python MCP server, and TypeScript MCP server in parity. Use when adding a new MCP tool, SDK endpoint, or asked to expose a CMS action to MCP clients.
---

## Adding an MCP/SDK tool

Every SDK/MCP tool is backed by an API-key-authenticated `/api/sdk/*` FastAPI endpoint that both MCP servers call over HTTP — there's no shared base class enforcing parity between the two MCP servers, so each new tool must be added in all three places by hand, in this order.

### Steps

1. **Backend endpoint** — add the route to the relevant `cms_backend/routers/sdk_*.py` file (`sdk_schema.py`, `sdk_documents.py`, or `sdk_realtime_db.py`). Already mounted at `/api/sdk` in `cms_backend/main.py`; no extra wiring needed. Use `Depends(require_api_key("write"))` or `("read")` matching the operation.

2. **Python MCP server** (`cms_mcp/server.py`) — add an `@mcp.tool()` + `@with_guardrails("tool_name")` decorated async function under the matching `# ── Section ──` comment block. Copy the shape of an existing tool, e.g. `create_workspace` (~line 631):
   ```python
   @mcp.tool()
   @with_guardrails("create_workspace")
   async def create_workspace(project_id: str | None = None, workspace_name: str = "") -> str:
       """Create a non-production workspace to write draft content into. ..."""
       if not workspace_name:
           raise ValueError("workspace_name is required and cannot be empty")
       pid = _resolve_project_id(project_id)
       return _dump(await _post(f"/projects/{pid}/workspaces/", data={"workspace_name": workspace_name}))
   ```
   `_is_write_tool()` infers read/write from the function name prefix (`create/update/delete/set/rtdb_*`) to enforce `MCP_READ_ONLY=true` — a new write tool's name **must** start with one of those prefixes.

3. **TypeScript MCP server** (`sdk/mcp/src/server.ts`) — add the same tool inside `createServer()` via `server.registerTool(...)`, under the matching `// Section` comment, mirroring the Python file's ordering:
   ```typescript
   server.registerTool(
     "create_workspace",
     {
       description: "Create a non-production workspace to write draft content into. ...",
       inputSchema: { project_id: z.string().optional(), workspace_name: z.string() },
     },
     withGuardrails("create_workspace", async ({ project_id, workspace_name }) => {
       return dump(await post(`/projects/${resolveProjectId(project_id)}/workspaces/`, { workspace_name }));
     }),
   );
   ```
   `isWriteTool()` mirrors the Python name-prefix check.

### Checklist

- [ ] Backend endpoint added to `cms_backend/routers/sdk_*.py`
- [ ] Python tool added to `cms_mcp/server.py`, name prefixed correctly for read/write inference
- [ ] TypeScript tool added to `sdk/mcp/src/server.ts`, same name and behavior
- [ ] Tool descriptions match between Python and TS (copy, don't reword)
- [ ] If the action should be admin-only (like push-to-production, API key management, version history), deliberately **skip** the SDK endpoint and MCP tools — those stay JWT-only by design

### Gotcha

Some actions intentionally have no SDK/MCP tool at all — API key issuance/revocation, push/pull-to-production, and document version history are JWT-only, never exposed to API-key clients. Don't add an SDK endpoint for these without confirming with the user first; it would be a deliberate scope change to the auth boundary, not just a new tool.
