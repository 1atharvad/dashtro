---
"dashtro": patch
---

Store media URLs as relative paths: document create/update (admin UI and SDK/MCP) now strips the scheme and host from absolute `/api/cms/media/files/...` and `/api/sdk/media/files/...` URLs, so documents imported from a backup exported over HTTP (where reads absolutify media URLs) no longer carry the source environment's domain.
