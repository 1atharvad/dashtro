"""SDK schema endpoints for import/export via API key authentication."""

import uuid
from api.utils import get_data_client, get_audit_client
from api.utils.api_key_auth import require_api_key, check_key_scope
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from api.utils.schema import schema_jsonify

router = APIRouter()


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
    schema_names = [s["_name"] for s in schema if s.get("_name")]
    return {"_schema_names": schema_names}


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


@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/")
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

    doc = await db.fetch_document(project_id, workspace_name, collection_id, document_id, depth=depth)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    return doc


# ── Schema Write (Import) ─────────────────────────────────────────────────────

@router.post("/projects/{project_id}/schema-categories/")
def create_schema_category(
    project_id: str,
    body: dict,
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
    return {"id": cat_id, "name": name}


@router.post("/projects/{project_id}/schema/")
def create_schema_field(
    project_id: str,
    body: dict,
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
    return {"_id": field_id, **body}


@router.put("/projects/{project_id}/schema/{field_id}/")
def update_schema_field(
    project_id: str,
    field_id: str,
    body: dict,
    key_info: dict = Depends(require_api_key("write")),
):
    """Update a schema field."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    db.upsert_schema_field(project_id, field_id, body)
    return {"_id": field_id, **body}


@router.delete("/projects/{project_id}/schema/{field_id}/")
def delete_schema_field(
    project_id: str,
    field_id: str,
    key_info: dict = Depends(require_api_key("write")),
):
    """Delete a schema field."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    db.delete_schema_field(project_id, field_id)
    return {"success": True}


@router.put("/projects/{project_id}/schema-category-map/{schema_name}/")
def update_schema_category_map(
    project_id: str,
    schema_name: str,
    body: dict,
    key_info: dict = Depends(require_api_key("write")),
):
    """Map schema to category."""
    check_key_scope(key_info, project_id, None)
    db = get_data_client()
    category_id = body.get("category_id")
    if not category_id:
        raise HTTPException(status_code=400, detail="category_id required")

    db.set_schema_category(project_id, schema_name, category_id)
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


@router.put("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/")
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
    from pathlib import Path
    import os

    upload_dir = Path(os.environ.get("CMS_UPLOAD_DIR", "/app/uploads"))
    file_path = upload_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found")

    return FileResponse(file_path, filename=filename)


@router.put("/media/files/{filename}")
def upload_media_file(
    filename: str,
    body: bytes,
    key_info: dict = Depends(require_api_key("write")),
):
    """Upload a media file."""
    from pathlib import Path
    import os

    upload_dir = Path(os.environ.get("CMS_UPLOAD_DIR", "/app/uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / filename
    file_path.write_bytes(body)

    return {"filename": filename, "size": len(body)}
