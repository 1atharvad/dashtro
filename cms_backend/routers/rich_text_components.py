import json
import uuid

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from fastapi import APIRouter, HTTPException, Request
from models.rich_text_component import RichTextComponentIn
from pydantic import ValidationError

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


@router.get("/projects/{project_id}/rich-text-components/")
def list_rich_text_components(project_id: str):
    components = db.get_rich_text_components(project_id)
    return [{"id": k, **v} for k, v in components.items()]


@router.post("/projects/{project_id}/rich-text-components/", status_code=201)
def create_rich_text_component(project_id: str, body: dict, request: Request):
    try:
        component = RichTextComponentIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=json.loads(e.json())) from e

    components = db.get_rich_text_components(project_id)
    if any(v["name"] == component.name for v in components.values()):
        raise HTTPException(status_code=400, detail=f"Component '{component.name}' already exists.")

    data = component.to_storage()
    component_id = str(uuid.uuid4().hex[:16])
    db.upsert_rich_text_component(project_id, component_id, data)
    actor = get_actor(request)
    db_audit.log(
        action="create_rich_text_component",
        resource_type="rich_text_component",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=component_id,
        resource_name=data["name"],
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"id": component_id, **data}


@router.put("/projects/{project_id}/rich-text-components/{component_id}/")
def update_rich_text_component(project_id: str, component_id: str, body: dict, request: Request):
    components = db.get_rich_text_components(project_id)
    if component_id not in components:
        raise HTTPException(status_code=404, detail="Component not found.")

    try:
        component = RichTextComponentIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=json.loads(e.json())) from e

    if any(k != component_id and v["name"] == component.name for k, v in components.items()):
        raise HTTPException(status_code=400, detail=f"Component '{component.name}' already exists.")

    data = component.to_storage()
    db.upsert_rich_text_component(project_id, component_id, data)
    actor = get_actor(request)
    db_audit.log(
        action="update_rich_text_component",
        resource_type="rich_text_component",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=component_id,
        resource_name=data["name"],
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"id": component_id, **data}


@router.delete("/projects/{project_id}/rich-text-components/{component_id}/", status_code=204)
def delete_rich_text_component(project_id: str, component_id: str, request: Request):
    components = db.get_rich_text_components(project_id)
    if component_id not in components:
        raise HTTPException(status_code=404, detail="Component not found.")

    component_name = components[component_id].get("name", "")
    db.delete_rich_text_component(project_id, component_id)
    actor = get_actor(request)
    db_audit.log(
        action="delete_rich_text_component",
        resource_type="rich_text_component",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=component_id,
        resource_name=component_name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
