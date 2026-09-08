# CMS Tool — Architecture

Scaffold-level design knowledge: how the system is built and why, as distinct from `PLAN.md` (what's currently being implemented).

## Data model hierarchy

```
Project (production workspace is read-only for direct document writes)
├── Schema (the blueprint — field definitions: name, type, relations, defaults)
├── Workspace (e.g. "staging", "production")
│   └── Collection (a named set of documents, all backed by one Schema)
│       └── Document (draft → published; its field values must match its collection's Schema)
```

A Schema defines the shape documents in a Collection must take — Collection is "a list of documents of the same Schema." Any write to a Document's field data should ultimately be validated against its Collection's Schema, not accepted as arbitrary JSON.

## Key naming convention: underscore prefix = system variable

A leading `_` on a key means it's a system variable — never a freely-typed, user-invented value. That covers exactly two sub-cases, no third:

- **(a) Fully system-generated/system-updated, no user input at all**: schema field `_id` and `_index` (always server-assigned — append-to-end on create; only an explicit reorder operation may set `_index`).
- **(b) A restricted, closed set of choices the user *selects* but never *invents***: `_type` (must be one of `ALL_FIELD_TYPES`), `_relation` (`OneToOne`/`OneToMany`), `_status` (`draft`/`published`). The user picks from a fixed enum — they never type an arbitrary string into these.
- **Counter-example**: `ProjectIn`'s `name`/`description`, and a document's own field values (`title`, `body`, ...) are genuinely free-form user-authored content and intentionally have no underscore — the convention marks system/enum ownership, not "internal-sounding name."
- **Deliberate exception — document `_id`**: unlike schema-field `_id`, a document's `_id` is honored if the caller supplies one on create, else server-generated — it doesn't cleanly fit (a) or (b). This is intentional: `cms_schema.py`'s backup/restore CLI (`cmd_documents_import_http`) depends on being able to recreate a document under its *original* id when restoring a backup into the same or a different project. Tightening this to pure system-generation was considered and rejected specifically because it would break that restore flow — don't "fix" this without a replacement mechanism for restore-with-original-id.

`_status` illustrates why the distinction matters in practice: it's case (b), so a caller *can* set it, but only through a checked enum, never as arbitrary text — `update_document_status` enforces this; any other write path that lets a caller set `_status` must enforce the same enum, or it's a gap (see `PLAN.md`).

Any tool/endpoint surface that accepts free-form data on behalf of a caller (MCP tool params, a document's field-value payload) should expose only clean, non-underscored names and map them to the underscored storage shape internally — a caller should never be able to type a literal `_`-prefixed key and have it pass straight through to storage.

**Exemption — RTDB** (`rtdb_get/set/update/delete`): intentionally free-form key/value JSON storage (feature flags, small config blobs), not schema-backed. There's no "system-owned key" concept there, so the underscore-ownership rule doesn't apply to it.

## Where validation lives

Validation belongs on the backend, not duplicated across clients (the MCP servers, the official SDKs, a future integration). A client-side pre-check is, at best, a fast/friendly-error convenience layered on top of a real backend guarantee — never the only thing standing between a caller and an invalid write. Concretely: `cms_backend/models/*.py` Pydantic models are the source of truth for shape/type validation, and uniqueness/cross-record checks (e.g. one `_display_name` per schema) belong in the router handler, checked atomically against the in-process data-client cache right before the write.
