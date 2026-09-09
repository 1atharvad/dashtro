---
"@dashtro/mcp": minor
---

Restrict `update_document_status` to `status: "draft"` only — `"published"` can no longer be set through this tool (or anywhere else in MCP). Publishing a document is now exclusively a side effect of pushing it to production through the CMS UI, which MCP has no access to; the backend enforces this independently of the tool's own schema.

Also: `update_document`'s `data` can no longer contain `_status` at all (previously allowed as an exception, checked against the `draft`/`published` enum) — editing a published document's data now automatically reverts its status to `draft`, since it no longer matches what was pushed to production. `create_document`'s docs were corrected to state that `_id` is honored if supplied (not always server-generated, as previously documented) and that `_status` can never be included in `data` on create.
