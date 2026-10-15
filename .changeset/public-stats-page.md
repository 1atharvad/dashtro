---
"dashtro": minor
---

Add a public `/stats/` page (backed by an unauthenticated `GET /api/stats/`) showing server status, release version, uptime, database reachability/latency/connection usage and process memory/threads. The snapshot is cached for 10 seconds. The image now exposes its version to the backend through the `APP_VERSION` build arg. Also cap the sync-endpoint and `asyncio.to_thread` worker pools at 8 threads each so per-thread Postgres connections no longer exhaust `max_connections`, and stop the MCP input filter from rejecting ordinary words containing "script" (TypeScript, JavaScript, description) next to angle-bracket tags in `cms_mcp`; only real `<script` tags and `on*=` handler attributes are rejected now.
