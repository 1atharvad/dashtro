"""SDK schema endpoints for import/export via API key authentication."""

import uuid
from datetime import UTC, datetime

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_client_ip
from api.utils.api_key_auth import check_key_scope, require_api_key
from api.utils.schema import get_schema_names as _get_schema_names
from api.utils.schema import schema_jsonify
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from models.collection import SchemaCollectionIn
from models.project import ProjectIn
from pydantic import ValidationError

PRODUCTION = "production"


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


router = APIRouter()
db_audit = get_audit_client()


def _key_actor(key_info: dict) -> tuple[str, str]:
    return f"apikey:{key_info['id']}", key_info["label"]


# ── Schema Read (Export) ──────────────────────────────────────────────────────


@router.get("/projects/{project_id}/schema/")
def get_schema_names(
    project_id: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get all schema names in project."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    schema = db.get_schema(project_id)
    return {"_schema_names": _get_schema_names(schema)}


@router.get("/projects/{project_id}/schema/{schema_name}/")
def get_schema(
    project_id: str,
    schema_name: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get schema fields by name."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    schema = db.get_schema(project_id)
    result = schema_jsonify(schema, allowed_schema_name=schema_name, sort_indices=True)
    return result


@router.get("/projects/{project_id}/schema-categories/")
def get_schema_categories(
    project_id: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get all schema categories/folders."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    categories = db.get_categories(project_id)
    category_map = db.get_category_map(project_id)
    return {
        "categories": [{"id": k, "name": v.get("name", "")} for k, v in categories.items()],
        "category_map": category_map,
    }


@router.get("/projects/{project_id}/collections/")
def get_collections(
    project_id: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get all collections."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    collections = db.get_collections(project_id)
    schema_collections = [
        {
            "_id": cid,
            "_collection_name": c.get("_collection_name"),
            "_schema_name": c.get("_schema_name"),
        }
        for cid, c in collections.items()
    ]
    return {"_schema_collections": schema_collections}


@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/")
async def get_collection_metadata(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get collection metadata (document IDs, statuses)."""
    check_key_scope(key_info, project_id, collection_name)
    db = get_data_client()
    collections = db.get_collections(project_id)
    collection_id = next(
        (cid for cid, c in collections.items() if c.get("_collection_name") == collection_name),
        None,
    )
    if not collection_id:
        raise HTTPException(status_code=404, detail=f"Collection {collection_name} not found")

    meta = await db.fetch_document(project_id, workspace_name, collection_id, "_meta_data")
    doc_ids = meta.get("_document_sequence", []) if meta else []
    statuses = meta.get("_document_statuses", {}) if meta else {}
    return {
        "_document_ids": [d for d in doc_ids if d],
        "_document_statuses": statuses,
    }


@router.get(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
)
async def get_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    depth: int = 1,
    key_info: dict = Depends(require_api_key("read")),
):
    """Get document by ID."""
    check_key_scope(key_info, project_id, collection_name)
    db = get_data_client()
    collections = db.get_collections(project_id)
    collection_id = next(
        (cid for cid, c in collections.items() if c.get("_collection_name") == collection_name),
        None,
    )
    if not collection_id:
        raise HTTPException(status_code=404, detail=f"Collection {collection_name} not found")

    doc = await db.fetch_document(
        project_id, workspace_name, collection_id, document_id, depth=depth
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    return doc


# ── Schema Write (Import) ─────────────────────────────────────────────────────


@router.post("/projects/{project_id}/schema-categories/")
def create_schema_category(
    project_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Create a schema category/folder."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name required")

    cat_id = uuid.uuid4().hex[:16]
    db.upsert_category(project_id, cat_id, {"name": name})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="create_category",
        resource_type="category",
        user_id=user_id,
        user_email=user_email,
        resource_id=cat_id,
        resource_name=name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"id": cat_id, "name": name}


@router.post("/projects/{project_id}/schema/")
def create_schema_field(
    project_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Create a schema field."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    schema_name = body.get("_schema_name")
    if not schema_name:
        raise HTTPException(status_code=400, detail="_schema_name required")

    field_id = uuid.uuid4().hex[:16]
    db.upsert_schema_field(project_id, field_id, body)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="create_schema_field",
        resource_type="schema_field",
        user_id=user_id,
        user_email=user_email,
        resource_id=field_id,
        resource_name=f"{schema_name}.{body.get('_name', '')}",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": field_id, **body}


@router.put("/projects/{project_id}/schema/{field_id}/")
def update_schema_field(
    project_id: str,
    field_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Update a schema field."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    db.upsert_schema_field(project_id, field_id, body)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="update_schema_field",
        resource_type="schema_field",
        user_id=user_id,
        user_email=user_email,
        resource_id=field_id,
        resource_name=f"{body.get('_schema_name', '')}.{body.get('_name', '')}",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": field_id, **body}


@router.delete("/projects/{project_id}/schema/{field_id}/")
def delete_schema_field(
    project_id: str,
    field_id: str,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Delete a schema field."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    db.delete_schema_field(project_id, field_id)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="delete_schema_field",
        resource_type="schema_field",
        user_id=user_id,
        user_email=user_email,
        resource_id=field_id,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"success": True}


@router.post("/projects/{project_id}/collections/")
def create_collection(
    project_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Create a collection."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()

    try:
        collection = SchemaCollectionIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.errors()) from e

    schema_names = _get_schema_names(db.get_schema(project_id))
    if collection.schema_name not in schema_names:
        raise HTTPException(status_code=400, detail="Schema doesn't exist, create it first.")

    data = collection.to_storage()
    collection_id = uuid.uuid4().hex[:20]
    db.upsert_collection(project_id, collection_id, data)
    db.upsert_document(
        project_id, "production", collection_id, "_meta_data", {"_document_sequence": []}
    )

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="create_collection",
        resource_type="collection",
        user_id=user_id,
        user_email=user_email,
        resource_id=collection_id,
        resource_name=data.get("_collection_name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": collection_id, **data}


@router.put("/projects/{project_id}/collections/{collection_id}/")
def update_collection(
    project_id: str,
    collection_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Update a collection."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()

    collections = db.get_collections(project_id)
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found.")

    try:
        collection = SchemaCollectionIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.errors()) from e

    existing = {**collections[collection_id]}
    existing.update(collection.to_storage())
    db.upsert_collection(project_id, collection_id, existing)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="update_collection",
        resource_type="collection",
        user_id=user_id,
        user_email=user_email,
        resource_id=collection_id,
        resource_name=existing.get("_collection_name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": collection_id, **existing}


@router.delete("/projects/{project_id}/collections/{collection_id}/", status_code=204)
def delete_collection(
    project_id: str,
    collection_id: str,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Delete a collection, including its documents in every workspace."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()

    collections = db.get_collections(project_id)
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found.")

    collection_name = collections[collection_id].get("_collection_name", "")
    workspaces = db.fetch_workspaces(project_id)
    for ws in workspaces:
        db.delete_collection_workspace_docs(project_id, ws["workspace_name"], collection_id)

    db.delete_collection_record(project_id, collection_id)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="delete_collection",
        resource_type="collection",
        user_id=user_id,
        user_email=user_email,
        resource_id=collection_id,
        resource_name=collection_name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.post("/projects/", status_code=201)
def create_project(
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Create a project through the API-key surface.

    Only an unscoped key (one with no `project_id` bound to it) can do this —
    a key already scoped to a specific project has no business minting new
    ones. Mirrors routers/projects.py's JWT-authenticated create_project,
    including the auto-created "production" workspace.
    """
    if key_info.get("project_id"):
        raise HTTPException(status_code=403, detail="API key is scoped to a single project")

    try:
        data = ProjectIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.errors()) from e

    db = get_data_client()
    project_id = uuid.uuid4().hex[:20]
    now = _now_iso()
    project_data = {
        "name": data.name,
        "description": data.description,
        "created_at": now,
        "updated_at": now,
    }
    db.upsert_project(project_id, project_data)
    db.upsert_workspace(project_id, PRODUCTION, {"is_production": True, "created_at": now})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="create_project",
        resource_type="project",
        user_id=user_id,
        user_email=user_email,
        resource_id=project_id,
        resource_name=data.name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": project_id, **project_data}


@router.put("/projects/{project_id}/")
def update_project(
    project_id: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Update a project's name/description through the API-key surface."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()

    existing = db.get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        data = ProjectIn.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.errors()) from e

    updated = {
        "name": data.name,
        "description": data.description,
        "created_at": existing.get("created_at", _now_iso()),
        "updated_at": _now_iso(),
    }
    db.upsert_project(project_id, updated)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="update_project",
        resource_type="project",
        user_id=user_id,
        user_email=user_email,
        resource_id=project_id,
        resource_name=data.name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"_id": project_id, **updated}


@router.delete("/projects/{project_id}/", status_code=204)
def delete_project(
    project_id: str,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Delete a project through the API-key surface.

    Mirrors routers/projects.py's JWT-authenticated delete_project, but scoped
    to whatever project the API key is bound to (check_key_scope rejects any
    other project_id). delete_project_record cascades the removal across
    workspaces, schema, collections, and every workspace's documents, so
    there's nothing left to clean up manually afterward.
    """
    check_key_scope(key_info, project_id, None)
    db = get_data_client()

    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    db.delete_project_record(project_id)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="delete_project",
        resource_type="project",
        user_id=user_id,
        user_email=user_email,
        resource_id=project_id,
        resource_name=project.get("name", ""),
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.put("/projects/{project_id}/schema-category-map/{schema_name}/")
def update_schema_category_map(
    project_id: str,
    schema_name: str,
    body: dict,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Map schema to category."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    category_id = body.get("category_id")
    if not category_id:
        raise HTTPException(status_code=400, detail="category_id required")

    db.set_schema_category(project_id, schema_name, category_id)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="assign_category",
        resource_type="schema",
        user_id=user_id,
        user_email=user_email,
        resource_id=schema_name,
        resource_name=schema_name,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"schema_name": schema_name, "category_id": category_id}


@router.post("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/")
async def create_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    body: dict,
    key_info: dict = Depends(require_api_key("write")),
):
    """Create a document in a collection."""
    check_key_scope(key_info, project_id, collection_name)
    db = get_data_client()
    collections = db.get_collections(project_id)
    collection_id = next(
        (cid for cid, c in collections.items() if c.get("_collection_name") == collection_name),
        None,
    )
    if not collection_id:
        raise HTTPException(status_code=404, detail=f"Collection {collection_name} not found")

    doc_id = body.get("_id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="_id required")

    doc_data = {k: v for k, v in body.items() if k != "_id"}
    await db.upsert_document(project_id, workspace_name, collection_id, doc_id, doc_data)
    return {"_id": doc_id, **doc_data}


@router.put(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
)
async def update_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    body: dict,
    key_info: dict = Depends(require_api_key("write")),
):
    """Update a document (merge mode)."""
    check_key_scope(key_info, project_id, collection_name)
    db = get_data_client()
    collections = db.get_collections(project_id)
    collection_id = next(
        (cid for cid, c in collections.items() if c.get("_collection_name") == collection_name),
        None,
    )
    if not collection_id:
        raise HTTPException(status_code=404, detail=f"Collection {collection_name} not found")

    await db.upsert_document(project_id, workspace_name, collection_id, document_id, body)
    return {"_id": document_id, **body}


@router.get("/media/files/{filename}")
def download_media_file(
    filename: str,
    key_info: dict = Depends(require_api_key("read")),
):
    """Download a media file."""
    import os
    from pathlib import Path

    upload_dir = Path(os.environ.get("CMS_UPLOAD_DIR", "/app/uploads"))
    file_path = upload_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found")

    return FileResponse(file_path, filename=filename)


@router.put("/media/files/{filename}")
def upload_media_file(
    filename: str,
    body: bytes,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    """Upload a media file."""
    import os
    from pathlib import Path

    upload_dir = Path(os.environ.get("CMS_UPLOAD_DIR", "/app/uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / filename
    file_path.write_bytes(body)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="upload_media",
        resource_type="media",
        user_id=user_id,
        user_email=user_email,
        resource_name=filename,
        details={"size_bytes": len(body)},
        ip_address=get_client_ip(request),
    )
    return {"filename": filename, "size": len(body)}
