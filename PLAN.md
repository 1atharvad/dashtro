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
