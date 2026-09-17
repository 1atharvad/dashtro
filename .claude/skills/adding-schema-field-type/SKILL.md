---
name: adding-schema-field-type
description: Add a new schema field type (scalar or compound) to cms-tool, updating the backend registry, validation, and frontend renderers that must stay in sync. Use when asked to add a new field type to the CMS schema system.
---

## Adding a schema field type

`ALL_FIELD_TYPES` in `cms_backend/models/field_types.py` is the canonical registry, but it's hand-duplicated in three other places — all of them must be updated together, and how much work is needed depends on whether the type is **scalar** or **compound**.

### Compound field type (has subfields, e.g. Image/URL/File-style)

1. Add an entry to `COMPOUND_FIELD_TYPES` in `cms_backend/models/field_types.py` with its subfields and defaults.
2. That's structurally sufficient on the backend — validation (`document_validation.py`), the schema dropdown, and the frontend's generic renderer all pick it up automatically via `GET /api/cms/field-types/`.
3. If it needs a bespoke input widget (not just generic subfield rendering), set `dedicated_component: true` and add a component under `cms-frontend/src/ts/components/fields/` (see `ImageField.tsx`, `FileField.tsx`, `LinkField.tsx` for the pattern), wired into `cms-frontend/src/ts/components/DocumentEntry.tsx` with a new `{variableType === 'X' && <XField .../>}` branch.

### Scalar field type (String/Number/Boolean-style, no subfields)

1. Add it to `SCALAR_FIELD_TYPES` in `cms_backend/models/field_types.py`.
2. Add a new `elif field_type == "NewType":` branch in `_validate_single_value()` in `cms_backend/api/utils/document_validation.py` (or add to `_SCALAR_STRING_TYPES` at the top of that file if it's just string-typed with no special validation).
3. Add a new `{variableType === 'NewType' && (<TextField .../>)}` block in `cms-frontend/src/ts/components/DocumentEntry.tsx` (around the existing `String`/`Number`/`Boolean` blocks) — scalar types are **not** auto-handled by the generic frontend renderer, unlike compound types.
4. If the type can be used as a `OneToMany` array item, add an entry to `defaultItemForType` in the same file.

### Mirrors to update by hand (all repos, not derivable from one source of truth)

- [ ] `cms_backend/models/field_types.py` — `ALL_FIELD_TYPES` (source of truth)
- [ ] `cms_mcp/server.py` — `ALL_FIELD_TYPES` tuple (comment: "keep in sync")
- [ ] `sdk/mcp/src/server.ts` — `ALL_FIELD_TYPES` const array
- [ ] `cms-frontend/src/ts/types/constants.ts` — `FIELD_TYPES` const (comment: "Mirrors models.field_types.ALL_FIELD_TYPES")

### Don't touch

The schema field *editor* UI (`cms-frontend/src/ts/components/SchemaEntry.tsx`) is data-driven via `hide_field_for` maps returned by `get_schema_field_ui_schema()` in `cms_backend/models/schema.py` — it is **not** a per-type switch statement. Only edit `hide_field_for` lists there if the new type needs a conditional field (`_relation`, `_default_value`, `_placeholder`, etc.) hidden or shown differently than existing types; don't add a new case to `SchemaEntry.tsx` itself.
