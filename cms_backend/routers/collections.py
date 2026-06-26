import uuid
from typing import Any

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from api.utils.schema import get_schema_names
from fastapi import APIRouter, HTTPException, Request
from models.collection import SchemaCollectionIn, get_collection_ui_schema
from pydantic import ValidationError

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


@router.get("/projects/{project_id}/collections/")
def list_collections(project_id: str):
    collections = db.get_collections(project_id)
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)
    collection_list = [{"_id": cid, **cdata} for cid, cdata in collections.items()]
    collection_list.sort(key=lambda c: c.get("_collection_name", "").lower())
    for i, col in enumerate(collection_list, start=1):
        col["_index"] = i
    return {
        "_schema_collections": collection_list,
        "_collection_schema_variables": get_collection_ui_schema(names),
    }


@router.post("/projects/{project_id}/collections/", status_code=201)
def create_collection(project_id: str, body: dict[str, Any], request: Request):
    schema = db.get_schema(project_id)
    names = get_schema_names(schema)

    try:
        collection = SchemaCollectionIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
        ) from e

    if collection.schema_name not in names:
        raise HTTPException(status_code=400, detail="Schema doesn't exist, create it first.")

    data = collection.to_storage()
    collection_id = str(uuid.uuid4().hex[:20])

    db.upsert_collection(project_id, collection_id, data)
    db.upsert_document(
        project_id, "production", collection_id, "_meta_data", {"_document_sequence": []}
    )

    actor = get_actor(request)
    db_audit.log(
        action="create_collection",
        resource_type="collection",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=collection_id,
        resource_name=data.get("_collection_name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )

    collections = db.get_collections(project_id)
    collection_list = [{"_id": cid, **cdata} for cid, cdata in collections.items()]
    collection_list.sort(key=lambda c: c.get("_collection_name", "").lower())
    for i, col in enumerate(collection_list, start=1):
        col["_index"] = i
    return {
        "_schema_collections": collection_list,
        "_collection_schema_variables": get_collection_ui_schema(names),
    }


@router.put("/projects/{project_id}/collections/{collection_id}/")
def update_collection(project_id: str, collection_id: str, body: dict[str, Any], request: Request):
    collections = db.get_collections(project_id)
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found.")

    existing = {**collections[collection_id]}
    try:
        collection = SchemaCollectionIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
        ) from e

    updates = collection.to_storage()
    for key, value in updates.items():
        existing[key] = value

    db.upsert_collection(project_id, collection_id, existing)
    actor = get_actor(request)
    db_audit.log(
        action="update_collection",
        resource_type="collection",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=collection_id,
        resource_name=existing.get("_collection_name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": collection_id, **existing}


@router.delete("/projects/{project_id}/collections/{collection_id}/", status_code=204)
def delete_collection(project_id: str, collection_id: str, request: Request):
    collections = db.get_collections(project_id)
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found.")

    collection_name = collections[collection_id].get("_collection_name", "")
    workspaces = db.fetch_workspaces(project_id)
    for ws in workspaces:
        db.delete_collection_workspace_docs(project_id, ws["workspace_name"], collection_id)

    db.delete_collection_record(project_id, collection_id)
    actor = get_actor(request)
    db_audit.log(
        action="delete_collection",
        resource_type="collection",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=collection_id,
        resource_name=collection_name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
