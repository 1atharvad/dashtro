"""Validate a document's field data against its collection's schema.

Schema is the blueprint for a collection's documents (see ARCHITECTURE.md) —
a document write should never be able to invent a field that isn't defined
on the schema, hand a value of the wrong shape/type to a field that is, or
skip a field the schema marks `_required`. This is the document-write
counterpart to models/schema.py's SchemaFieldIn validation on schema-field
writes.
"""

from typing import Any

from models.field_types import COMPOUND_FIELD_TYPES

_SCALAR_STRING_TYPES = {
    "String",
    "Email",
    "Date",
    "DateTime",
    "Color",
    "RichText",
    "Textarea",
}

_TRUE_FALSE_STRINGS = {"true", "false"}


class DocumentValidationError(ValueError):
    """A document's field data doesn't match its schema."""


def validate_document_data(
    data: dict[str, Any],
    schema_fields: list[dict],
    all_schemas: dict[str, list[dict]],
    *,
    depth: int = 0,
    max_depth: int = 10,
) -> None:
    """Raise DocumentValidationError if `data` doesn't match `schema_fields`.

    `data` must contain only real field names from `schema_fields` (no
    underscore-prefixed system keys, no invented fields) with values of the
    right shape for their field's `_type`/`_relation`. `all_schemas` (every
    schema in the project, keyed by name) is needed to recursively validate
    NestedDocument fields against their own `_nested_schema`.
    """
    if depth > max_depth:
        raise DocumentValidationError(
            "Document nesting too deep — check for a circular _nested_schema reference."
        )

    fields_by_name = {f["_name"]: f for f in schema_fields}

    for key in data:
        if key.startswith("_"):
            raise DocumentValidationError(f"'{key}': system-owned key, cannot be set directly.")
        if key not in fields_by_name:
            raise DocumentValidationError(f"'{key}' is not a field defined on this schema.")

    for field in schema_fields:
        name = field["_name"]
        if name not in data or data[name] in (None, "", []):
            if field.get("_required"):
                raise DocumentValidationError(f"'{name}' is required.")
            continue
        _validate_field_value(name, data[name], field, all_schemas, depth, max_depth)


def _validate_field_value(
    name: str,
    value: Any,
    field: dict,
    all_schemas: dict[str, list[dict]],
    depth: int,
    max_depth: int,
) -> None:
    field_type = field.get("_type", "String")
    is_many = field.get("_relation") == "OneToMany"

    if is_many:
        if not isinstance(value, list):
            raise DocumentValidationError(f"'{name}': expected a list (relation is OneToMany).")
        for i, item in enumerate(value):
            _validate_single_value(
                f"{name}[{i}]", item, field_type, field, all_schemas, depth, max_depth
            )
    else:
        _validate_single_value(name, value, field_type, field, all_schemas, depth, max_depth)


def _validate_single_value(
    label: str,
    value: Any,
    field_type: str,
    field: dict,
    all_schemas: dict[str, list[dict]],
    depth: int,
    max_depth: int,
) -> None:
    if field_type in _SCALAR_STRING_TYPES:
        if not isinstance(value, str):
            raise DocumentValidationError(f"'{label}': expected a string for {field_type}.")

    elif field_type == "Number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise DocumentValidationError(f"'{label}': expected a number.")

    elif field_type == "Boolean":
        is_valid_bool = isinstance(value, bool) or (
            isinstance(value, str) and value in _TRUE_FALSE_STRINGS
        )
        if not is_valid_bool:
            raise DocumentValidationError(f"'{label}': expected a boolean.")

    elif field_type in COMPOUND_FIELD_TYPES:
        default = COMPOUND_FIELD_TYPES[field_type]["default"]
        if not isinstance(value, dict):
            raise DocumentValidationError(f"'{label}': expected an object for {field_type}.")
        unknown = set(value) - set(default)
        if unknown:
            raise DocumentValidationError(
                f"'{label}': unknown subfield(s) {sorted(unknown)} for {field_type}."
            )
        for subkey, default_value in default.items():
            if subkey in value and not isinstance(value[subkey], type(default_value)):
                raise DocumentValidationError(f"'{label}.{subkey}': wrong type.")

    elif field_type == "ReferenceDocument":
        if not isinstance(value, str):
            raise DocumentValidationError(f"'{label}': expected a document id (string).")

    elif field_type == "NestedDocument":
        if not isinstance(value, dict):
            raise DocumentValidationError(f"'{label}': expected an object for NestedDocument.")
        nested_schema_name = field.get("_nested_schema")
        nested_fields = all_schemas.get(nested_schema_name, [])
        validate_document_data(
            value, nested_fields, all_schemas, depth=depth + 1, max_depth=max_depth
        )

    else:
        raise DocumentValidationError(f"'{label}': unknown field type {field_type}.")
