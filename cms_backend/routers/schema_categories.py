import uuid

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


@router.get("/projects/{project_id}/schema-categories/")
def list_categories(project_id: str):
    categories = db.get_categories(project_id)
    category_map = db.get_category_map(project_id)
    return {
        "categories": [{"id": k, **v} for k, v in categories.items()],
        "category_map": category_map,
    }


@router.post("/projects/{project_id}/schema-categories/", status_code=201)
def create_category(project_id: str, body: dict, request: Request):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required.")
    categories = db.get_categories(project_id)
    if any(v["name"] == name for v in categories.values()):
        raise HTTPException(status_code=400, detail=f"Category '{name}' already exists.")
    cat_id = str(uuid.uuid4().hex[:16])
    db.upsert_category(project_id, cat_id, {"name": name})
    actor = get_actor(request)
    db_audit.log(
        action="create_category",
        resource_type="schema_category",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=cat_id,
        resource_name=name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"id": cat_id, "name": name}


@router.put("/projects/{project_id}/schema-categories/{cat_id}/")
def update_category(project_id: str, cat_id: str, body: dict, request: Request):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required.")
    categories = db.get_categories(project_id)
    if cat_id not in categories:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.upsert_category(project_id, cat_id, {"name": name})
    actor = get_actor(request)
    db_audit.log(
        action="update_category",
        resource_type="schema_category",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=cat_id,
        resource_name=name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"id": cat_id, "name": name}


@router.delete("/projects/{project_id}/schema-categories/{cat_id}/", status_code=204)
def delete_category(project_id: str, cat_id: str, request: Request):
    categories = db.get_categories(project_id)
    if cat_id not in categories:
        raise HTTPException(status_code=404, detail="Category not found.")
    cat_name = categories[cat_id].get("name", "")
    db.delete_category(project_id, cat_id)
    actor = get_actor(request)
    db_audit.log(
        action="delete_category",
        resource_type="schema_category",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=cat_id,
        resource_name=cat_name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.put("/projects/{project_id}/schema-category-map/{schema_name}/")
def set_schema_category(project_id: str, schema_name: str, body: dict, request: Request):
    category_id = body.get("category_id", "")
    if category_id:
        categories = db.get_categories(project_id)
        if category_id not in categories:
            raise HTTPException(status_code=400, detail="Category not found.")
    db.set_schema_category(project_id, schema_name, category_id)
    actor = get_actor(request)
    db_audit.log(
        action="assign_category",
        resource_type="schema_category",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=schema_name,
        project_id=project_id,
        details={"schema_name": schema_name, "category_id": category_id},
        ip_address=get_client_ip(request),
    )
    return {"schema_name": schema_name, "category_id": category_id}
