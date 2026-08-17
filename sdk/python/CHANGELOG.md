# Changelog

Version kept in lockstep with `@dashtro/client` (sdk/js) via Changesets — see sdk/js/.changeset/README.md.

## 0.3.0

### Minor Changes

- Add guardrails for production hardening: token-bucket rate limiting (60 RPM default, configurable via `MCP_RATE_LIMIT`), input sanitization (string trimming, 10k char limit, injection pattern detection), request body size validation (1MB default, configurable via `MCP_MAX_BODY_SIZE`), and read-only mode toggle (`MCP_READ_ONLY=true` disables all write tools).
- Add token optimization features: `minimal: true` default on listing tools (`list_collections`, `list_documents`, `get_document`) returning only essential fields (~50-70% token savings), and compact JSON output (no pretty-print indentation, ~30-50% savings).
- Make `project_id` optional in all tools with fallback to `CMS_PROJECT_ID` environment variable.

## 0.2.1

### Patch Changes

- 3d35060: Fix package metadata: add license (ISC), author, repository, and publishConfig.access=public, which were missing from the 0.2.0 publish. Also fixes an exports-field ordering warning (types now listed before import/require).

