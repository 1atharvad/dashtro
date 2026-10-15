---
"@dashtro/mcp": patch
---

The input sanitizer no longer rejects any string that merely contains "script" next to `<` and `>`, which blocked ordinary content such as TypeScript, JavaScript, "description" or "subscriptions" inside RichText component tags. It now rejects only a real `<script` tag or an `on*=` event-handler attribute inside a tag, matching the Python `cms_mcp` server.
