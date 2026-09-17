---
"@dashtro/mcp": patch
---

`get_document` now requests `raw=1` from the backend so RichText fields always come back as their stored markdown/component tags (e.g. `<HighlightedText>...</HighlightedText>`) instead of baked HTML. MCP is an authoring/import-export surface, not a deployed project's SDK read path, so component tags should stay untouched for round-tripping.
