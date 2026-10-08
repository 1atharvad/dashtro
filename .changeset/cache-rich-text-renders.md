---
"dashtro": patch
---

SDK document reads no longer wait on RichText component rendering. Component renders are cached in memory by component source and content; a read returns cached markup where it exists and the tag's inner content where it doesn't, while a single background worker finishes the renders so the next read is complete. Editing a component re-renders it, failed renders are not cached, and a reference to an undefined component still fails fast with a 422.
