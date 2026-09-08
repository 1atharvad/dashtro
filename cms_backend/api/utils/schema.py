def schema_jsonify(schema: dict, allowed_schema_name=None, sort_indices=False) -> dict:
    result = {}
    for schema_id, schema_data in schema.items():
        schema_name = schema_data.get("_schema_name")
        if allowed_schema_name and allowed_schema_name != schema_name:
            continue
        entry = {**schema_data, "_id": schema_id}
        if schema_name not in result:
            result[schema_name] = []
        result[schema_name].append({k: v for k, v in entry.items() if k != "_schema_name"})
    if sort_indices:
        for key in result:
            result[key] = sorted(result[key], key=lambda d: d.get("_index", 0))
    return result


def jsonify_data(data: dict, key: str) -> dict:
    result = {}
    for id, value in data.items():
        key_val = value[key]
        result[key_val] = {**value, "_id": id}
    return result


def get_schema_names(schema: dict) -> list:
    names = []
    for doc in schema.values():
        name = doc.get("_schema_name")
        if name and name not in names:
            names.append(name)
    return names


def get_schema_for_collection(collection_name: str, collections: dict, schema: dict):
    by_name = jsonify_data(collections, "_collection_name")
    if collection_name not in by_name:
        return {"error": "Invalid collection name, no schema found for that collection."}
    info = by_name[collection_name]
    collection_id = info.get("_id")
    schema_name = info.get("_schema_name")
    schema_data = schema_jsonify(schema, allowed_schema_name=schema_name, sort_indices=True)
    return collection_id, schema_name, schema_data.get(schema_name)


def next_schema_index(schema: dict, schema_name: str) -> int:
    """Next _index for a newly created field in schema_name: one past
    whatever the current highest index in that schema is (1 if the schema
    doesn't exist yet). Used so field ordering on create is always
    server-assigned, never a caller-supplied value.
    """
    existing = [
        field_data.get("_index", 0)
        for field_data in schema.values()
        if field_data.get("_schema_name") == schema_name
    ]
    return (max(existing) if existing else 0) + 1


def check_index_and_display_name_conflicts(
    schema: dict,
    schema_name: str,
    index: int,
    display_name: bool,
    exclude_field_id: str | None = None,
) -> None:
    """Raise ValueError if index or display_name would collide with another
    field already in the same schema. Call before writing a new/updated field.
    """
    for field_id, field_data in schema.items():
        if field_id == exclude_field_id or field_data.get("_schema_name") != schema_name:
            continue
        if field_data.get("_index") == index:
            raise ValueError(
                f"Index {index} already used by field '{field_data.get('_name')}' "
                f"in schema '{schema_name}'"
            )
        if display_name and field_data.get("_display_name"):
            raise ValueError(
                f"Schema '{schema_name}' already has a display_name field: "
                f"'{field_data.get('_name')}'. Only one display_name field allowed per schema."
            )


def reindex_schema_after_delete(schema: dict, deleted_id: str) -> tuple[list[str], str | None]:
    """Remove a field from the in-memory schema dict and reindex remaining fields.

    Returns (ids_that_shifted, schema_name_if_now_empty).
    """
    if deleted_id not in schema:
        return [], None

    deleted = schema[deleted_id]
    deleted_index = deleted["_index"]
    schema_name = deleted["_schema_name"]

    del schema[deleted_id]

    shifted_ids = []
    remaining_count = 0
    for sid, sdata in schema.items():
        if sdata.get("_schema_name") == schema_name:
            remaining_count += 1
            if sdata["_index"] > deleted_index:
                sdata["_index"] -= 1
                shifted_ids.append(sid)

    removed_name = schema_name if remaining_count == 0 else None
    return shifted_ids, removed_name
