---
name: documenting-python-code
description: Write a docstring on every Python function, test, and helper in this repo, in this repo's established plain one-line style. Use when writing or editing any Python code in cms_backend, cms_mcp, or scripts.
---

## Documenting Python code

Every function, test, and helper written for this repo gets a docstring — including ones whose name already looks self-explanatory (e.g. `test_list_collections`). This is broader than the general "only comment the non-obvious why" default (see CLAUDE.md Hard Rules > Code style).

### House style: short, plain, one line when possible

This repo does **not** use Google/NumPy-style `Args:`/`Returns:` sections. A docstring states what the function does in one sentence; explain *why* only when it's non-obvious, and prefer putting extended "why" context in a module-level docstring rather than repeating it per-function.

**One-liner** (`cms_backend/tests/test_cms_schema_cli_http.py`):
```python
def _free_port() -> int:
    """Ask the OS for an unused localhost port to bind the test uvicorn server to."""
```

**Function with args — still just describes behavior, no args/returns boilerplate** (`cms_backend/api/utils/document_validation.py`):
```python
def validate_document_data(
    data: dict[str, Any],
    schema_fields: list[dict],
    all_schemas: dict[str, list[dict]],
    *,
    depth: int = 0,
    max_depth: int = 10,
) -> None:
    """Raise DocumentValidationError if `data` doesn't match `schema_fields`."""
```

**Module-level docstring carries the "why" once, at the top of the file** — individual functions in that file don't need to repeat it (same file):
```python
"""Validate a document's field data against its collection's schema.

Schema is the blueprint for a collection's documents (see ARCHITECTURE.md) —
a document write should never be able to invent a field that isn't defined
on the schema, hand a value of the wrong shape/type to a field that is, or
skip a field the schema marks `_required`.
"""
```

### For test functions specifically

Same rule applies even when the test name is descriptive — a one-line docstring on `def test_list_collections():` is still required. (TS/JS `describe`/`it` blocks are exempt — the `it("...")` description string satisfies this there; that exemption doesn't extend to Python.)

### Checklist

- [ ] Every `def` (including private `_helpers` and tests) has a docstring, even if the name seems obvious
- [ ] One line where one line suffices — no invented `Args:`/`Returns:` sections
- [ ] Non-obvious "why" goes in the module docstring, not repeated per function
