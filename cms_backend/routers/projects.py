import uuid
from datetime import UTC, datetime
from typing import Any

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from api.utils.workspace_diff import diff_workspaces
from fastapi import APIRouter, HTTPException, Request
from models.project import ProjectIn, WorkspaceIn
from pydantic import ValidationError

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()

PRODUCTION = "production"


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


# ── Projects ─────────────────────────────────────────────────────────────────


@router.get("/projects/")
def list_projects():
    return db.fetch_all_projects()


@router.get("/projects/{project_id}/")
def get_project(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post("/projects/", status_code=201)
def create_project(body: dict[str, Any], request: Request):
    try:
        data = ProjectIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
        ) from e

    project_id = str(uuid.uuid4().hex[:20])
    now = _now_iso()
    project_data = {
        "name": data.name,
        "description": data.description,
        "created_at": now,
        "updated_at": now,
    }
    db.upsert_project(project_id, project_data)
    db.upsert_workspace(
        project_id,
        PRODUCTION,
        {
            "is_production": True,
            "created_at": now,
        },
    )
    actor = get_actor(request)
    db_audit.log(
        action="create_project",
        resource_type="project",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=project_id,
        resource_name=data.name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": project_id, **project_data}


@router.put("/projects/{project_id}/")
def update_project(project_id: str, body: dict[str, Any], request: Request):
    existing = db.get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        data = ProjectIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
        ) from e

    updated = {
        "name": data.name,
        "description": data.description,
        "created_at": existing.get("created_at", _now_iso()),
        "updated_at": _now_iso(),
    }
    db.upsert_project(project_id, updated)
    actor = get_actor(request)
    db_audit.log(
        action="update_project",
        resource_type="project",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=project_id,
        resource_name=data.name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": project_id, **updated}


@router.delete("/projects/{project_id}/", status_code=204)
def delete_project(project_id: str, request: Request):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    db.delete_project_record(project_id)
    actor = get_actor(request)
    db_audit.log(
        action="delete_project",
        resource_type="project",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=project_id,
        resource_name=project.get("name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.post("/projects/{project_id}/duplicate/", status_code=201)
async def duplicate_project(project_id: str, request: Request):
    """Create an independent copy of a project under a new project id.

    Copies schema fields, categories and their schema-name assignments,
    collections, rich text components, every workspace (including
    production) along with its documents, and the realtime database tree.
    The copy is named "{source name} (Copy)" and gets its own uuid, so
    editing or deleting it afterward has no effect on the source project —
    nothing is shared or referenced, everything is written as fresh rows.

    Runs through db.get_*/upsert_* only (no raw SQL), so this works
    unmodified against either SqliteData or PostgresData.
    """
    source = db.get_project(project_id)
    if not source:
        raise HTTPException(status_code=404, detail="Project not found.")

    new_project_id = str(uuid.uuid4().hex[:20])
    now = _now_iso()
    project_data = {
        "name": f"{source.get('name', '')} (Copy)",
        "description": source.get("description", ""),
        "created_at": now,
        "updated_at": now,
    }
    db.upsert_project(new_project_id, project_data)

    for field_id, field_data in db.get_schema(project_id).items():
        db.upsert_schema_field(new_project_id, field_id, field_data)

    for cat_id, cat_data in db.get_categories(project_id).items():
        db.upsert_category(new_project_id, cat_id, cat_data)

    for schema_name, category_id in db.get_category_map(project_id).items():
        if category_id:
            db.set_schema_category(new_project_id, schema_name, category_id)

    collection_ids = list(db.get_collections(project_id).keys())
    for collection_id, collection_data in db.get_collections(project_id).items():
        db.upsert_collection(new_project_id, collection_id, collection_data)

    for component_id, component_data in db.get_rich_text_components(project_id).items():
        db.upsert_rich_text_component(new_project_id, component_id, component_data)

    for ws in db.fetch_workspaces(project_id):
        workspace_name = ws["workspace_name"]
        db.upsert_workspace(
            new_project_id,
            workspace_name,
            {"is_production": ws.get("is_production", False), "created_at": ws.get("created_at", now)},
        )
        for doc in db.fetch_all_workspace_documents(project_id, workspace_name):
            db.upsert_document(
                new_project_id,
                workspace_name,
                doc["collection_id"],
                doc["document_id"],
                doc["data"],
            )
        # fetch_all_workspace_documents excludes "_meta_data" (it stores the
        # document ordering/status index, not a real document) — carry it
        # over per collection so the duplicate's document lists aren't empty.
        for collection_id in collection_ids:
            meta = await db.fetch_document(project_id, workspace_name, collection_id, "_meta_data")
            if meta:
                db.upsert_document(new_project_id, workspace_name, collection_id, "_meta_data", meta)

    rtdb_tree = db.get_rtdb(project_id)
    if rtdb_tree:
        db.set_rtdb_path(new_project_id, "", rtdb_tree)

    actor = get_actor(request)
    db_audit.log(
        action="duplicate_project",
        resource_type="project",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=new_project_id,
        resource_name=project_data["name"],
        project_id=new_project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": new_project_id, **project_data}


# ── Workspaces ────────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/workspaces/")
def list_workspaces(project_id: str):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    return db.fetch_workspaces(project_id)


@router.post("/projects/{project_id}/workspaces/", status_code=201)
def create_workspace(project_id: str, body: dict[str, Any], request: Request):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        data = WorkspaceIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": list(err["loc"]), "msg": err["msg"]} for err in e.errors()],
        ) from e

    existing = db.get_workspace(project_id, data.workspace_name)
    if existing:
        raise HTTPException(status_code=400, detail="Workspace name already exists.")

    now = _now_iso()
    workspace_data = {"is_production": False, "created_at": now}
    db.upsert_workspace(project_id, data.workspace_name, workspace_data)
    actor = get_actor(request)
    db_audit.log(
        action="create_workspace",
        resource_type="workspace",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=data.workspace_name,
        project_id=project_id,
        workspace_name=data.workspace_name,
        ip_address=get_client_ip(request),
    )
    return {"workspace_name": data.workspace_name, **workspace_data}


@router.delete("/projects/{project_id}/workspaces/{workspace_name}/", status_code=204)
def delete_workspace(project_id: str, workspace_name: str, request: Request):
    if workspace_name == PRODUCTION:
        raise HTTPException(status_code=400, detail="Cannot delete the production workspace.")
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    if not db.get_workspace(project_id, workspace_name):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    db.delete_workspace_record(project_id, workspace_name)
    actor = get_actor(request)
    db_audit.log(
        action="delete_workspace",
        resource_type="workspace",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=workspace_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )


@router.post("/projects/{project_id}/workspaces/{workspace_name}/push-to-prod/")
def push_to_production(project_id: str, workspace_name: str, request: Request):
    if workspace_name == PRODUCTION:
        raise HTTPException(status_code=400, detail="Cannot push production to itself.")
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    if not db.get_workspace(project_id, workspace_name):
        raise HTTPException(status_code=404, detail="Workspace not found.")

    db.push_workspace_to_production(project_id, workspace_name)
    actor = get_actor(request)
    db_audit.log(
        action="push_to_production",
        resource_type="workspace",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=workspace_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"source_workspace": workspace_name, "target": "production"},
        ip_address=get_client_ip(request),
    )
    return {"detail": f"Workspace '{workspace_name}' pushed to production."}


@router.get("/projects/{project_id}/workspaces/{workspace_name}/diff-vs-production/")
def diff_vs_production(project_id: str, workspace_name: str):
    if workspace_name == PRODUCTION:
        raise HTTPException(status_code=400, detail="Cannot diff production against itself.")
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    if not db.get_workspace(project_id, workspace_name):
        raise HTTPException(status_code=404, detail="Workspace not found.")

    source_docs = db.fetch_all_workspace_documents(project_id, workspace_name)
    target_docs = db.fetch_all_workspace_documents(project_id, PRODUCTION)
    return diff_workspaces(source_docs, target_docs)


@router.post("/projects/{project_id}/workspaces/{workspace_name}/pull-from-production/")
def pull_from_production(
    project_id: str, workspace_name: str, body: dict[str, Any], request: Request
):
    if workspace_name == PRODUCTION:
        raise HTTPException(status_code=400, detail="Cannot pull production into itself.")
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    if not db.get_workspace(project_id, workspace_name):
        raise HTTPException(status_code=404, detail="Workspace not found.")

    resolutions = body.get("resolutions", {})
    db.pull_from_production(project_id, workspace_name, resolutions)
    actor = get_actor(request)
    db_audit.log(
        action="pull_from_production",
        resource_type="workspace",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=workspace_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={
            "target_workspace": workspace_name,
            "source": "production",
            "resolutions": resolutions,
        },
        ip_address=get_client_ip(request),
    )
    return {"detail": f"Latest production content pulled into '{workspace_name}'."}
