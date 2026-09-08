# @dashtro/mcp

## 0.3.0

### Minor Changes

- fb4b8bc: Fix `create_schema_field` always sending `_relation: ""` to the backend for non-relational field types — the backend's `_relation` is a strict `OneToOne`/`OneToMany` enum with no empty-string case, so every schema field creation through this server was rejected with a 400. An unset relation now gets the same explicit `OneToOne` default the backend itself applies.

  Also remove the `index` parameter from `create_schema_field`: `_index` is always server-assigned on create (append-to-end of the schema), so a caller-supplied value was silently discarded and had no effect — it's no longer accepted.

## 0.2.1

### Patch Changes

- b19f70a: Fix read-only mode not blocking rtdb_set/rtdb_update/rtdb_delete, project_id empty-string fallback, XSS check bracket parity with Python server, and incorrect skill resource descriptions.

## 0.3.0

### Minor Changes

- Add guardrails for production hardening: token-bucket rate limiting (60 RPM default, configurable via `MCP_RATE_LIMIT`), input sanitization (string trimming, 10k char limit, injection pattern detection), request body size validation (1MB default, configurable via `MCP_MAX_BODY_SIZE`), and read-only mode toggle (`MCP_READ_ONLY=true` disables all write tools).
- Add token optimization features: `minimal: true` default on listing tools (`list_collections`, `list_documents`, `get_document`) returning only essential fields (~50-70% token savings), and compact JSON output (no pretty-print indentation, ~30-50% savings).
- Make `project_id` optional in all tools with fallback to `CMS_PROJECT_ID` environment variable.

## 0.2.0

### Minor Changes

- 20b945f: Switch to API-key-only auth (`X-API-Key` against `/api/sdk/*`, no JWT) and add project/workspace/schema/collection authoring tools: `create_project`, `update_project`, `delete_project`, `create_workspace`, `create_schema_field`, `delete_schema_field`, `create_collection`, `delete_collection`. Previously the server only had tools for documents and the realtime database on things that already existed — there was no way to set up a project from scratch through MCP. `CMS_API_URL` now needs to point at `/api/sdk` (was `/api/cms`), and `CMS_TOKEN` is replaced by `CMS_API_KEY`.

## 0.1.1

### Patch Changes

- f023250: Initial release: npx-runnable MCP server (Node/TS port of `cms_mcp/server.py`) exposing Dashtro CMS projects, schema, collections, documents, versions, and the realtime database as MCP tools over HTTP.
