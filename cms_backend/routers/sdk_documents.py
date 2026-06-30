import uuid
from typing import Any

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_client_ip
from api.utils.api_key_auth import check_key_scope, require_api_key
from config import CMS_PUBLIC_URL
from fastapi import APIRouter, Depends, HTTPException, Request
from routers.documents import (
    _absolutify_media,
    _apply_schema_defaults,
    _get_meta,
    _guard_production_write,
    _resolve_collection,
    _resolve_references,
)

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


def _key_actor(key_info: dict) -> tuple[str, str]:
    return f"apikey:{key_info['id']}", key_info["label"]


# ── Read endpoints ────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/")
async def get_collection(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    key_info: dict = Depends(require_api_key("read")),
):
    check_key_scope(key_info, project_id, collection_name)
    collection_id, schema_name, schema_data = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    display_name_field = next(
        (f["_name"] for f in (schema_data or []) if f.get("_display_name")),
        None,
    )
    document_labels: dict[str, str] = {}
    if display_name_field and document_ids:
        import asyncio

        docs = await asyncio.gather(
            *[
                db.fetch_document(project_id, workspace_name, collection_id, doc_id)
                for doc_id in document_ids
            ]
        )
        for doc_id, doc in zip(document_ids, docs, strict=False):
            if doc and display_name_field in doc:
                document_labels[doc_id] = str(doc[display_name_field])

    return {
        "_schema_name": schema_name,
        "_schema": schema_data,
        "_document_ids": document_ids,
        "_document_statuses": document_statuses,
        "_document_labels": document_labels,
    }


@router.get(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
)
async def get_document(
    request: Request,
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    depth: int = 3,
    key_info: dict = Depends(require_api_key("read")),
):
    check_key_scope(key_info, project_id, collection_name)
    collection_id, _, schema_fields = _resolve_collection(project_id, collection_name)
    document_ids, _ = await _get_meta(project_id, workspace_name, collection_id)
    if document_id not in document_ids:
        raise HTTPException(status_code=404, detail="Document not found in the collection.")
    doc = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if doc:
        schema_keys = {f["_name"] for f in schema_fields} if schema_fields else set()
        if schema_fields:
            doc = _apply_schema_defaults(doc, schema_fields)
        doc = await _resolve_references(
            doc, schema_fields, project_id, workspace_name, max_depth=depth
        )
        doc = {
            k: v
            for k, v in doc.items()
            if k in schema_keys
            or (v not in ("", [], None) and not (isinstance(v, str) and v.strip() == ""))
        }
        media_base = (
            CMS_PUBLIC_URL.rstrip("/") if CMS_PUBLIC_URL else str(request.base_url).rstrip("/")
        )
        doc = _absolutify_media(doc, media_base)
    return doc


# ── Write endpoints ───────────────────────────────────────────────────────────


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/",
    status_code=201,
)
async def create_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    body: dict[str, Any],
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    check_key_scope(key_info, project_id, collection_name)
    _guard_production_write(workspace_name)
    collection_id, _, schema_data = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    doc_id = body.get("_id") or str(uuid.uuid4().hex[:20])
    body["_id"] = doc_id
    body.setdefault("_status", "draft")
    body = _apply_schema_defaults(body, schema_data)

    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        doc_id,
        {k: v for k, v in body.items() if k != "_id"},
    )

    document_statuses[doc_id] = body["_status"]
    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        "_meta_data",
        {
            "_document_sequence": [*document_ids, doc_id],
            "_document_statuses": document_statuses,
        },
    )

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="create_document",
        resource_type="document",
        user_id=user_id,
        user_email=user_email,
        resource_id=doc_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )
    return body


@router.put(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
)
async def update_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    body: dict[str, Any],
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    check_key_scope(key_info, project_id, collection_name)
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=400, detail="Document id doesn't exist.")

    existing = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    user_id, user_email = _key_actor(key_info)
    db.save_document_version(
        project_id, workspace_name, collection_id, document_id, existing, user_id, user_email
    )

    for key, value in body.items():
        existing[key] = value
    existing["_id"] = document_id

    if "_status" in body:
        document_statuses[document_id] = body["_status"]
        db.upsert_document(
            project_id,
            workspace_name,
            collection_id,
            "_meta_data",
            {
                "_document_sequence": document_ids,
                "_document_statuses": document_statuses,
            },
        )

    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        document_id,
        {k: v for k, v in existing.items() if k != "_id"},
    )

    db_audit.log(
        action="update_document",
        resource_type="document",
        user_id=user_id,
        user_email=user_email,
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )
    return existing


@router.patch(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/"
)
async def update_document_status(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    body: dict[str, Any],
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    check_key_scope(key_info, project_id, collection_name)
    _guard_production_write(workspace_name)
    status = body.get("_status")
    if status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="_status must be 'draft' or 'published'.")

    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=404, detail="Document not found.")

    existing = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    existing["_status"] = status
    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        document_id,
        {k: v for k, v in existing.items() if k != "_id"},
    )
    document_statuses[document_id] = status
    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        "_meta_data",
        {
            "_document_sequence": document_ids,
            "_document_statuses": document_statuses,
        },
    )

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="update_document",
        resource_type="document",
        user_id=user_id,
        user_email=user_email,
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"_status": status},
        ip_address=get_client_ip(request),
    )
    return {**existing, "_id": document_id}


@router.delete(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
    status_code=204,
)
async def delete_document(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    request: Request,
    key_info: dict = Depends(require_api_key("write")),
):
    check_key_scope(key_info, project_id, collection_name)
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=400, detail="Document id doesn't exist.")

    updated_ids = [i for i in document_ids if i != document_id]
    document_statuses.pop(document_id, None)
    db.upsert_document(
        project_id,
        workspace_name,
        collection_id,
        "_meta_data",
        {
            "_document_sequence": updated_ids,
            "_document_statuses": document_statuses,
        },
    )
    db.delete_document(project_id, workspace_name, collection_id, document_id)

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="delete_document",
        resource_type="document",
        user_id=user_id,
        user_email=user_email,
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )
