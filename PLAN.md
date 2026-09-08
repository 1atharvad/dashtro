# CMS Tool — Plan

## SDK & API Security

### Goal
Backend accessible only via:
- **CMS frontend** — JWT auth, full admin access
- **SDK** — API key auth, scoped access

### Architecture
```
Internet → cloudflared → nginx
                          ├── /          → frontend (React app)
                          ├── /api/cms/  → backend (JWT required)
                          └── /api/sdk/  → backend (API key required)
```

### API Key Scopes
Keys are issued from the CMS settings page and scoped at creation time:
- **Operations:** `read`, `write` (per collection)
- **Collections:** specific collections only, not all
- **Example:** `{ scopes: ["read:posts", "write:posts"], collections: ["posts", "tags"] }`

Write operations allowed through SDK — rate limited more aggressively than reads.

### To Do
- [x] Separate FastAPI router at `/api/sdk/` with API key middleware — `routers/sdk_documents.py` (read/write documents, mirrors `/api/cms/documents`), gated by `require_api_key()` in `api/utils/api_key_auth.py`; keyed on `X-API-Key`, no JWT involved
- [x] Updated the official SDK clients (`sdk/python/dashtro_client`, `sdk/js`) to hit `/api/sdk/` with a required `api_key`/`apiKey` param sending `X-API-Key` — they were previously pointed at `/api/cms/` with no auth at all. Bumped both to 0.2.0 (breaking constructor change).
- [x] API key model: project-scoped, collection + operation scopes, revocable — `cms_api_keys` extended with `project_id`/`collections`/`scopes`/`revoked_at`; `verify_api_key()` + `check_key_scope()` enforce project/collection scoping on every SDK request
- [x] SDK key management UI in CMS settings (issue, revoke, view last used) — `SettingsAPI.tsx` create dialog now sends `project_id`/`collections`/`scopes`, table shows project/collections/scopes/status/last-used; new `PATCH /api/cms/auth/api-keys/{id}/revoke/` endpoint (`routers/auth.py`) sets `revoked_at` instead of hard-deleting; `verify_api_key()` now stamps `last_used_at` on every successful SDK request (`sqlite_client.py`)
- [x] nginx rate limit zones: stricter for SDK writes than reads — `nginx/nginx.conf` adds `sdk_read_zone` (30r/s), `sdk_write_zone` (5r/s), and `cms_zone` (60r/s); SDK read/write split via `map`-derived keys (empty key = zone skipped for that method) since `limit_req` can't live inside `limit_except`
- [x] Fix unauthenticated `fetchCollection` / `fetchDocument` in `documentSlice.ts` — swapped to `authFetch`, along with every other plain-`fetch` CMS read that had the same hole (schemaSlice, projectSlice, collectionSlice, categorySlice, workspaceSlice, schemaPresetSlice, richTextComponentSlice, ReferenceDocumentField)
- [x] Move JWT enforcement to FastAPI middleware so no CMS route can accidentally skip it — `CMSAuthMiddleware` added, enforces on every `/api/cms/` route except signup/login/refresh/owner-exists/field-types(static)/media-files(public-by-design)

## MCP / SDK Write Integrity ("no AI slop")

### Goal
Nothing writable through `/api/sdk/*` (MCP tools included) should be able to produce a schema field or document that isn't a real, valid backend state — no invented field types, no orphaned relational fields, no duplicate ordering/labels, and no client ever setting a system-owned key directly. See `ARCHITECTURE.md`'s "Key naming convention" section for the underscore-ownership design principle this work is built on.

### To Do
- [x] `SchemaFieldIn` (`cms_backend/models/schema.py`) actually validated on the endpoint MCP calls — previously `routers/sdk_schema.py`'s `create_schema_field`/`update_schema_field` accepted the raw body with zero validation (the only two write endpoints in that router that skipped it); now both validate via `SchemaFieldIn.model_validate`, same pattern as `create_collection`/`create_project`
- [x] `SchemaFieldIn` gained a `model_validator` requiring `nested_schema`/`reference_schema` when the type demands them, and `_index` gained `ge=1` — previously accepted empty/zero silently on both `/api/cms` and `/api/sdk`
- [x] Index-uniqueness and display-name-uniqueness (only one per schema) enforced server-side atomically in both `routers/schema.py` and `routers/sdk_schema.py` (`api/utils/schema.py::check_index_and_display_name_conflicts`) — previously unenforced anywhere, not even the admin UI, and only ever checked client-side (racy, TOCTOU) by the MCP servers
- [x] `_index` is now always server-assigned on create (`api/utils/schema.py::next_schema_index` — one past the current max in that schema), never caller-supplied — matches what the admin frontend already computed client-side (`SchemaComponent.tsx`'s `schema.length + newSchemaEntry.length + 1`), so this is a no-op for the admin UI and removes `index` entirely from the MCP tool's `create_schema_field` signature in both `cms_mcp/server.py` and `sdk/mcp/src/server.ts`
- [x] MCP-side racy `_validate_index_unique`/`_validate_display_name_unique` pre-checks removed from both MCP servers now that the backend enforces atomically; MCP error messages enriched to surface the backend's actual `detail` text instead of a bare status code
- [x] Same integrity pass for **document** writes (`create_document`/`update_document` in both `sdk_documents.py` and JWT `documents.py`) via new `api/utils/document_validation.py::validate_document_data` — rejects any `_`-prefixed key or field not defined on the collection's schema, type-checks every present value against its field's `_type`/`_relation` (including recursive `NestedDocument` validation, `ReferenceDocument` single-id-vs-list-of-ids, and compound `Image`/`URL`/`File`/`ScrollLink` subfield shapes), enforces `_required` fields have a non-empty value. `_status` on both create and update is now checked against `("draft","published")` even outside the dedicated `update_document_status` endpoint (was previously unchecked on the generic write path). `update_document` also now rejects `_id` and any underscore key other than `_status`. Deleted a dead, unreachable duplicate of `create_document`/`update_document` in `sdk_schema.py` (silently shadowed by `sdk_documents.py`'s router registration order in `main.py`) found while doing this.
- [x] **Deliberate exception, not a gap**: document `_id` on *create* still honors a client-supplied value (unlike schema-field `_id`) — `cms_schema.py`'s backup/restore CLI depends on recreating documents under their original id. Considered and rejected making this fully server-generated; see `ARCHITECTURE.md`.
