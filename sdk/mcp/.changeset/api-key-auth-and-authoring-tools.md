---
"@dashtro/mcp": minor
---

Switch to API-key-only auth (`X-API-Key` against `/api/sdk/*`, no JWT) and add project/workspace/schema/collection authoring tools: `create_project`, `update_project`, `delete_project`, `create_workspace`, `create_schema_field`, `delete_schema_field`, `create_collection`, `delete_collection`. Previously the server only had tools for documents and the realtime database on things that already existed — there was no way to set up a project from scratch through MCP. `CMS_API_URL` now needs to point at `/api/sdk` (was `/api/cms`), and `CMS_TOKEN` is replaced by `CMS_API_KEY`.
