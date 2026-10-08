# @dashtro/client

## 0.3.0

### Minor Changes

- 9d465b3: RTDB client: add `push()` for generated-key children (deleting one push-keyed child never shifts a sibling's address, unlike deleting a numeric list index would), and make `subscribe()` reconnect automatically with backoff on an unexpected drop instead of silently ending live updates. Also moves the API key off the websocket connection URL to a first-message handshake, so it no longer rides along in server/proxy access logs.

## 0.2.1

### Patch Changes

- 3d35060: Fix package metadata: add license (ISC), author, repository, and publishConfig.access=public, which were missing from the 0.2.0 publish. Also fixes an exports-field ordering warning (types now listed before import/require).
