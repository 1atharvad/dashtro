import json
import uuid
from typing import Any

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from api.utils.schema import get_schema_names, schema_jsonify
from fastapi import APIRouter, HTTPException, Request
from models.field_types import ADVI_WRAPPER_COMPONENTS
from models.schema import SchemaFieldIn, get_schema_field_ui_schema
from pydantic import ValidationError

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


@router.get("/projects/{project_id}/schema/")
def list_schema(project_id: str):
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)
    collections = db.get_collections(project_id)
    collection_names = sorted(
        [c.get("_collection_name") for c in collections.values() if c.get("_collection_name")]
    )
    custom_components = db.get_rich_text_components(project_id)
    rich_text_component_choices = [f"advi:{n}" for n in ADVI_WRAPPER_COMPONENTS] + [
        f"custom:{c['name']}" for c in custom_components.values()
    ]
    return {
        "_schema_names": names,
        "_schema_variables": get_schema_field_ui_schema(
            names, collection_names, rich_text_component_choices
        ),
    }


@router.get("/projects/{project_id}/schema/{schema_id}/")
def get_schema(project_id: str, schema_id: str):
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)
    if schema_id in names:
        result = schema_jsonify(schema, allowed_schema_name=schema_id, sort_indices=True)
    else:
        result = schema.get(schema_id)
    if not result:
        raise HTTPException(status_code=404, detail="Schema not found.")
    return result


@router.post("/projects/{project_id}/schema/", status_code=201)
def create_schema(project_id: str, body: dict[str, Any], request: Request):
    try:
        field = SchemaFieldIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=json.loads(e.json())) from e

    data = field.to_storage()
    field_id = str(uuid.uuid4().hex[:20])
    db.upsert_schema_field(project_id, field_id, data)
    actor = get_actor(request)
    db_audit.log(
        action="create_schema_field",
        resource_type="schema_field",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=field_id,
        resource_name=f"{data.get('_schema_name', '')}.{data.get('_name', '')}",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": field_id, **data}


@router.put("/projects/{project_id}/schema/{schema_id}/")
def update_schema(project_id: str, schema_id: str, body: dict[str, Any], request: Request):
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)

    if schema_id in names:
        raise HTTPException(
            status_code=400, detail="PUT is not allowed with the schema name in the URL."
        )
    if schema_id not in schema:
        raise HTTPException(
            status_code=400, detail="PUT is not allowed with an id which doesn't exist."
        )

    existing = {**schema[schema_id]}
    try:
        field = SchemaFieldIn.model_validate({**existing, **body})
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=json.loads(e.json())) from e

    updates = field.to_storage()
    for key, value in updates.items():
        if key == "_schema_name":
            continue
        existing[key] = value

    db.upsert_schema_field(project_id, schema_id, existing)
    actor = get_actor(request)
    db_audit.log(
        action="update_schema_field",
        resource_type="schema_field",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=schema_id,
        resource_name=f"{existing.get('_schema_name', '')}.{existing.get('_name', '')}",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": schema_id, **existing}


@router.delete("/projects/{project_id}/schema/{schema_id}/", status_code=204)
def delete_schema(project_id: str, schema_id: str, request: Request):
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)

    if schema_id in names:
        raise HTTPException(
            status_code=400, detail="DELETE is not allowed with the schema name in the URL."
        )
    if schema_id not in schema:
        raise HTTPException(
            status_code=400, detail="DELETE is not allowed with an id which doesn't exist."
        )

    field_data = schema[schema_id]
    db.delete_schema_field(project_id, schema_id)
    actor = get_actor(request)
    db_audit.log(
        action="delete_schema_field",
        resource_type="schema_field",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=schema_id,
        resource_name=f"{field_data.get('_schema_name', '')}.{field_data.get('_name', '')}",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
