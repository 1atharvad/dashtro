# CMS Tool — Architecture

Scaffold-level design knowledge: how the system is built and why, meant to
stay accurate as a standing reference. Distinct from `PLAN.md`, which tracks
active/completed work items — when a design decision here changes, update
this file in the same change; don't let it drift.

## Contents
- [System overview](#system-overview)
- [Data model hierarchy](#data-model-hierarchy)
- [Storage backends](#storage-backends)
- [Auth & API surfaces](#auth--api-surfaces)
- [MCP / SDK tool boundaries](#mcp--sdk-tool-boundaries)
- [Key naming convention: underscore prefix = system variable](#key-naming-convention-underscore-prefix--system-variable)
- [Document publish status & push-to-production](#document-publish-status--push-to-production)
- [Where validation lives](#where-validation-lives)

## System Overview

| Component | What it is |
|---|---|
| `cms_backend` | FastAPI app — the single source of truth. Everything else talks to it over HTTP. |
| `cms-frontend` | React/Vite admin UI. JWT-authenticated, full access. |
| `cms_mcp` | Python MCP server (`server.py`) + the `dashtro` backup/restore CLI (`scripts/cms_schema.py`), API-key-authenticated. |
| `sdk/mcp` | Node/TypeScript port of `cms_mcp/server.py`, published to npm as `@dashtro/mcp` (npx-runnable). Kept behaviorally in sync with the Python server by hand — see the "MCP / SDK tool boundaries" section below for what both intentionally omit. |
| `sdk/js`, `sdk/python` | Thin client SDKs for `/api/sdk/*`, API-key-authenticated. |

## Data Model Hierarchy

```
Project (production workspace is read-only for direct document writes)
├── Schema (the blueprint — field definitions: name, type, relations, defaults)
├── Workspace (e.g. "staging", "production")
│   └── Collection (a named set of documents, all backed by one Schema)
│       └── Document (draft → published; its field values must match its collection's Schema)
```

A Schema defines the shape documents in a Collection must take — Collection is "a list of documents of the same Schema." Any write to a Document's field data should ultimately be validated against its Collection's Schema, not accepted as arbitrary JSON.

## Storage Backends

`cms_backend` supports two interchangeable storage backends, selected by `DB_TYPE` in `.env`:

- **SQLite** (`DB_TYPE=sqlite`, default) — `api/utils/sqlite_client.py`. A local file (`SQLITE_DB_PATH`). What CI and a plain `pytest`/`npm run test:backend` run against.
- **Postgres** (`DB_TYPE=postgres`) — `api/utils/postgres_client.py`. An external or dockerized database (`npm run dev:postgres`, which runs `docker compose --profile postgres up --build`).

`SqliteData` and `PostgresData` implement the same data-access interface **independently** — there's no shared base class enforcing parity, so a behavior change to one must be hand-mirrored in the other (SQL dialect differs too: SQLite's JSON1 `json_set()` vs Postgres's native `jsonb_set()`/`JSONB` column type). `cms_backend/tests/conftest.py` supports running the whole suite against Postgres instead of the SQLite default — set `TEST_DB_TYPE=postgres` (with `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` pointing at a reachable instance) and rerun pytest; this is opt-in and not part of CI or plain local runs, so a Postgres-only regression can still land unnoticed if nobody runs it explicitly before merging — treat any Postgres-only bug report as higher-priority than usual for that reason.

## Auth & API Surfaces

```
Internet → cloudflared → nginx
                          ├── /          → frontend (React app)
                          ├── /api/cms/  → backend (JWT required)
                          └── /api/sdk/  → backend (API key required)
```

Two independent auth surfaces reach the same backend:

- **`/api/cms/*`** — JWT auth (`CMSAuthMiddleware`, enforced on every route except signup/login/refresh/owner-exists/field-types/media-files), full admin access. This is what `cms-frontend` uses.
- **`/api/sdk/*`** — API-key auth (`X-API-Key`, checked by `require_api_key()` in `api/utils/api_key_auth.py`), scoped access. This is what MCP servers and the client SDKs use.

API keys are issued from the CMS settings page (`/api/cms/auth/api-keys/`, JWT-only — a key can never mint another key) and scoped at creation time:
- **Operations**: `read`, `write` (per collection)
- **Collections**: specific collections only, not all — `{ scopes: ["read:posts", "write:posts"], collections: ["posts", "tags"] }`
- **Project scope**: a key is either unscoped (any project) or locked to one project id — `create_project` only works with an unscoped key.

Writes through `/api/sdk/*` are rate-limited more aggressively than reads (nginx `sdk_write_zone` vs `sdk_read_zone`).

## MCP / SDK Tool Boundaries

Not everything `/api/cms/*` can do is exposed through `/api/sdk/*` (and therefore through MCP). Some actions are deliberately JWT/UI-only:

- **API key issuance/revocation** — an API-key client can never mint or revoke keys, including its own.
- **Push-to-production / pull-from-production** — `push_document_to_production`, `push_collection_to_production`, and their pull counterparts (`routers/documents.py`) exist only on the JWT router. MCP has no push/pull tool at all. This is also the only thing that can ever set a document's `_status` to `published` — see the next section.
- **Document version history** — list/restore version endpoints are JWT-only.

Everything else that's meaningfully "authoring" (create/update/delete project, workspace, schema field, collection, document; realtime database) is exposed to both surfaces, kept in behavioral parity between `cms_mcp/server.py` (Python) and `sdk/mcp/src/server.ts` (TypeScript).

## Key Naming Convention: Underscore Prefix = System Variable

A leading `_` on a key means it's a system variable — never a freely-typed, user-invented value. That covers exactly two sub-cases, no third:

- **(a) Fully system-generated/system-updated, no user input at all**: schema field `_id` and `_index` (always server-assigned — append-to-end on create; only an explicit reorder operation may set `_index`). A document's `_status` is also this category as of this session's redesign — see the dedicated section below; it doesn't fit the historical case (b) description that used to apply to it.
- **(b) A restricted, closed set of choices the user *selects* but never *invents***: `_type` (must be one of `ALL_FIELD_TYPES`), `_relation` (`OneToOne`/`OneToMany`). The user picks from a fixed enum via a normal write — they never type an arbitrary string into these, but they *can* set them directly.
- **Counter-example**: `ProjectIn`'s `name`/`description`, and a document's own field values (`title`, `body`, ...) are genuinely free-form user-authored content and intentionally have no underscore — the convention marks system/enum ownership, not "internal-sounding name."
- **Deliberate exception — document `_id`**: unlike schema-field `_id`, a document's `_id` is honored if the caller supplies one on create, else server-generated — it doesn't cleanly fit (a) or (b). This is intentional: `cms_schema.py`'s backup/restore CLI (`cmd_documents_import_http`) depends on being able to recreate a document under its *original* id when restoring a backup into the same or a different project. Tightening this to pure system-generation was considered and rejected specifically because it would break that restore flow — don't "fix" this without a replacement mechanism for restore-with-original-id.

Any tool/endpoint surface that accepts free-form data on behalf of a caller (MCP tool params, a document's field-value payload) should expose only clean, non-underscored names and map them to the underscored storage shape internally — a caller should never be able to type a literal `_`-prefixed key and have it pass straight through to storage.

**Exemption — RTDB** (`rtdb_get/set/update/delete`): intentionally free-form key/value JSON storage (feature flags, small config blobs), not schema-backed. There's no "system-owned key" concept there, so the underscore-ownership rule doesn't apply to it.

## Document Publish Status & Push-to-Production

`_status` (`draft`/`published`) is **fully system-owned** — case (a), not the "user picks from an enum" case (b) it used to be described as. No write path lets a caller set it to an arbitrary value of their choosing; the only two ways it ever changes are:

1. **`create_document`** always starts a new document as `draft`. Including `_status` in the request data at all — valid value or not — is rejected as a system-owned key, same as any other underscore-prefixed key.
2. **Pushing to production** (`push_document_to_production` / `push_collection_to_production`, JWT-only, see "MCP / SDK tool boundaries") is the *only* thing that can ever set `_status` to `published`. It stamps `published` onto **both** the source document (in whatever workspace it was pushed from) and the production copy — not just the production copy — specifically so the next point works:
3. **Editing a published document's data reverts it to `draft`** automatically (`update_document`, both `/api/cms` and `/api/sdk`) — a "dirty" flag. Once a document no longer matches what's live in production, it's not accurate to call it published anymore, so an edit clears that state until the document is pushed again. `update_document` itself never accepts `_status` in its body at all (no exception, not even a valid value) — this revert is the *only* way it changes status, and it only fires when the update actually contains field changes (an empty-body update is a no-op, not a de-publish).
4. **`update_document_status`** (the one dedicated status-changing endpoint/tool) is restricted to `_status: "draft"` only. It exists as an explicit, deliberate "take this out of production sync" action distinct from the auto-revert-on-edit case above — `published` is never an accepted value here, enforced both client-side (MCP tool schema) and server-side (`sdk_documents.py`) independently.

**This is unrelated to the CMS frontend's own "Published"/"Draft" badge** in a non-production workspace's document view (`DocumentContent.tsx`) — that's computed live from a diff against the production workspace's actual content (`outOfSync` — was this document's data actually pushed and does it still match?), not read from the stored `_status` field at all. The stored `_status` field is what MCP/SDK clients see via `list_documents`/`get_document`; the frontend's diff-based computation is what a human editor sees. They're kept *consistent* in practice (push syncs both; an edit dirties both), but they're computed independently, by design — don't wire one to read the other without re-deriving this reasoning.

## Where Validation Lives

Validation belongs on the backend, not duplicated across clients (the MCP servers, the official SDKs, a future integration). A client-side pre-check is, at best, a fast/friendly-error convenience layered on top of a real backend guarantee — never the only thing standing between a caller and an invalid write. Concretely: `cms_backend/models/*.py` Pydantic models are the source of truth for shape/type validation, `api/utils/document_validation.py::validate_document_data` is the source of truth for document-field validation against a collection's schema, and uniqueness/cross-record checks (e.g. one `_display_name` per schema) belong in the router handler, checked atomically against the in-process data-client cache right before the write.
