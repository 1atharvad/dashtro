---
"@dashtro/mcp": minor
---

Fix `create_schema_field` always sending `_relation: ""` to the backend for non-relational field types — the backend's `_relation` is a strict `OneToOne`/`OneToMany` enum with no empty-string case, so every schema field creation through this server was rejected with a 400. An unset relation now gets the same explicit `OneToOne` default the backend itself applies.

Also remove the `index` parameter from `create_schema_field`: `_index` is always server-assigned on create (append-to-end of the schema), so a caller-supplied value was silently discarded and had no effect — it's no longer accepted.
