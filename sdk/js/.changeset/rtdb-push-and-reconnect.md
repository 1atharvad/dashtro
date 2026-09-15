---
"@dashtro/client": minor
---

RTDB client: add `push()` for generated-key children (deleting one push-keyed child never shifts a sibling's address, unlike deleting a numeric list index would), and make `subscribe()` reconnect automatically with backoff on an unexpected drop instead of silently ending live updates. Also moves the API key off the websocket connection URL to a first-message handshake, so it no longer rides along in server/proxy access logs.
