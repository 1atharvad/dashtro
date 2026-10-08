---
"dashtro": minor
---

Show the app version in the Settings sidebar, now driven by Changesets (root `package.json` and the `dashtro` PyPI package are kept in lockstep). Fix backup import over HTTP: document bodies no longer include the system-owned `_status` key, and the SDK media upload route now accepts the multipart upload the CLI sends.
