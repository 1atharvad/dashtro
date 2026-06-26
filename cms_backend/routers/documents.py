import asyncio
import uuid
from typing import Any

from api.utils import get_audit_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from api.utils.schema import get_schema_for_collection
from config import CMS_PUBLIC_URL
from fastapi import APIRouter, HTTPException, Request
from models.field_types import COMPOUND_FIELD_TYPES

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()

PRODUCTION = "production"


def _resolve_collection(project_id: str, collection_name: str):
    collections = db.get_collections(project_id)
    schema = db.get_schema(project_id)
    result = get_schema_for_collection(collection_name, collections, schema)
    if isinstance(result, dict) and "error" in result:
        matches = [c for c in collections.values() if c.get("_schema_name") == collection_name]
        if len(matches) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"'{collection_name}' matches multiple collections; use a collection name instead of a schema name.",
            )
        if len(matches) == 1:
            fallback_name = matches[0].get("_collection_name")
            fallback = get_schema_for_collection(fallback_name, collections, schema)
            if not (isinstance(fallback, dict) and "error" in fallback):
                return fallback
        raise HTTPException(status_code=400, detail=result["error"])
    return result


def _normalize(data):
    if isinstance(data, list) and data == [""]:
        return []
    return data


_SCALAR_TYPE_EMPTY: dict[str, Any] = {
    "Boolean": False,
    "Number": 0,
}


def _apply_schema_defaults(data: dict, schema_fields: list[dict]) -> dict:
    for field in schema_fields:
        field_name = field["_name"]
        field_type = field.get("_type", "String")
        explicit_default = field.get("_default_value", "")
        current = data.get(field_name)

        if current is None or current == "" or current == [] or field_name not in data:
            if explicit_default not in ("", None):
                data[field_name] = explicit_default
            elif field_type in _SCALAR_TYPE_EMPTY:
                data[field_name] = _SCALAR_TYPE_EMPTY[field_type]
            elif field_type in COMPOUND_FIELD_TYPES:
                data[field_name] = dict(COMPOUND_FIELD_TYPES[field_type]["default"])
            else:
                data[field_name] = ""
    return data


def _absolutify_media(obj: any, base_url: str) -> any:
    """Recursively prepend base_url to any media path stored as a relative /api/cms/media/ string."""
    if isinstance(obj, str):
        return (base_url + obj) if obj.startswith("/api/cms/media/") else obj
    if isinstance(obj, dict):
        return {k: _absolutify_media(v, base_url) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_absolutify_media(i, base_url) for i in obj]
    return obj


async def _resolve_one_reference(
    ref_id: Any,
    ref_colls: list[str],
    project_id: str,
    workspace_name: str,
    level: int,
    max_depth: int,
) -> dict | None:
    """Resolve a single reference ID to its document (recursing into its own references),
    or wrap it as {'_document_id': ref_id} if the depth limit is reached or it can't be found."""
    if not isinstance(ref_id, str) or not ref_id:
        return None
    if level >= max_depth:
        return {"_document_id": ref_id}

    collections = db.get_collections(project_id)
    coll_by_name = {v["_collection_name"]: k for k, v in collections.items()}
    schema = db.get_schema(project_id)

    for coll_name in ref_colls:
        coll_id = coll_by_name.get(coll_name)
        if not coll_id:
            continue
        ref_doc = await db.fetch_document(project_id, workspace_name, coll_id, ref_id)
        if ref_doc:
            resolved_schema = get_schema_for_collection(coll_name, collections, schema)
            ref_schema_fields = (
                [] if isinstance(resolved_schema, dict) else (resolved_schema[2] or [])
            )
            resolved = await _resolve_references(
                ref_doc,
                ref_schema_fields,
                project_id,
                workspace_name,
                level + 1,
                max_depth,
            )
            resolved["_document_id"] = ref_id
            return resolved
    return {"_document_id": ref_id}


async def _resolve_references(
    doc: dict,
    schema_fields: list[dict],
    project_id: str,
    workspace_name: str,
    level: int = 1,
    max_depth: int = 3,
) -> dict:
    """Inline referenced documents in place of their IDs, recursively, up to max_depth levels
    (the root document is level 1). Beyond max_depth, or if a reference can't be resolved,
    the field is returned as {'_document_id': <id>} instead of a bare ID string so callers can
    tell an unresolved reference apart from a plain string field."""
    result = dict(doc)

    for field in schema_fields:
        if field.get("_type") != "ReferenceDocument":
            continue
        field_name = field["_name"]
        value = doc.get(field_name)
        if not value:
            continue
        ref_colls = [c for c in field.get("_reference_schema", []) if c]

        if isinstance(value, list):
            result[field_name] = [
                resolved
                for v in value
                if (
                    resolved := await _resolve_one_reference(
                        v, ref_colls, project_id, workspace_name, level, max_depth
                    )
                )
            ]
        else:
            resolved = await _resolve_one_reference(
                value, ref_colls, project_id, workspace_name, level, max_depth
            )
            if resolved is not None:
                result[field_name] = resolved

    return result


def _guard_production_write(workspace_name: str):
    if workspace_name == PRODUCTION:
        raise HTTPException(
            status_code=403,
            detail="Production workspace is read-only. Push content from another workspace.",
        )


async def _get_meta(project_id: str, workspace_name: str, collection_id: str) -> tuple[list, dict]:
    meta = await db.fetch_document(project_id, workspace_name, collection_id, "_meta_data")
    document_ids = _normalize(meta["_document_sequence"]) if meta else []
    document_statuses: dict = (meta.get("_document_statuses") or {}) if meta else {}
    return document_ids, document_statuses


# ── Read endpoints ────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/")
async def get_collection(project_id: str, workspace_name: str, collection_name: str):
    collection_id, schema_name, schema_data = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    display_name_field = next(
        (f["_name"] for f in (schema_data or []) if f.get("_display_name")),
        None,
    )
    document_labels: dict[str, str] = {}
    if display_name_field and document_ids:
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
):
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
        _media_base = (
            CMS_PUBLIC_URL.rstrip("/") if CMS_PUBLIC_URL else str(request.base_url).rstrip("/")
        )
        doc = _absolutify_media(doc, _media_base)
    return doc


# ── Mutation endpoints ────────────────────────────────────────────────────────


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
):
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

    actor = get_actor(request)
    db_audit.log(
        action="create_document",
        resource_type="document",
        user_id=actor["uid"],
        user_email=actor["email"],
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
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=400, detail="Document id doesn't exist.")

    existing = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Save current state as a version before overwriting
    actor = get_actor(request)
    db.save_document_version(
        project_id,
        workspace_name,
        collection_id,
        document_id,
        existing,
        actor["uid"],
        actor["email"],
    )

    for key, value in body.items():
        existing[key] = value
    existing["_id"] = document_id

    # Sync status in meta if it changed
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
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )
    return existing


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
):
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

    actor = get_actor(request)
    db_audit.log(
        action="delete_document",
        resource_type="document",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        ip_address=get_client_ip(request),
    )


# ── Scoped push/pull to production ───────────────────────────────────────────


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/push-to-prod/"
)
async def push_collection_to_production(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    request: Request,
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)

    db.push_collection_to_production(project_id, workspace_name, collection_id)

    actor = get_actor(request)
    db_audit.log(
        action="push_collection_to_production",
        resource_type="collection",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"source_workspace": workspace_name, "target": "production"},
        ip_address=get_client_ip(request),
    )
    return {"detail": f"Collection '{collection_name}' pushed to production."}


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/pull-from-production/"
)
async def pull_collection_from_production(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    body: dict[str, Any],
    request: Request,
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)

    resolutions = body.get("resolutions", {})
    db.pull_from_production(project_id, workspace_name, resolutions, collection_id=collection_id)

    actor = get_actor(request)
    db_audit.log(
        action="pull_collection_from_production",
        resource_type="collection",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"source": "production", "resolutions": resolutions},
        ip_address=get_client_ip(request),
    )
    return {"detail": f"Collection '{collection_name}' updated from production."}


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/push-to-prod/"
)
async def push_document_to_production(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    request: Request,
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)

    if not db.push_document_to_production(project_id, workspace_name, collection_id, document_id):
        raise HTTPException(status_code=404, detail="Document not found.")

    actor = get_actor(request)
    db_audit.log(
        action="push_document_to_production",
        resource_type="document",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"source_workspace": workspace_name, "target": "production"},
        ip_address=get_client_ip(request),
    )
    return {"detail": "Document pushed to production."}


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/pull-from-production/"
)
async def pull_document_from_production(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    request: Request,
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)

    prod_doc = await db.fetch_document(project_id, PRODUCTION, collection_id, document_id)
    if not prod_doc:
        raise HTTPException(status_code=404, detail="Document not found in production.")

    db.pull_from_production(
        project_id,
        workspace_name,
        resolutions={f"{collection_id}:{document_id}": "production"},
        collection_id=collection_id,
        document_id=document_id,
    )

    actor = get_actor(request)
    db_audit.log(
        action="pull_document_from_production",
        resource_type="document",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"source": "production"},
        ip_address=get_client_ip(request),
    )
    return {**prod_doc, "_id": document_id}


# ── Version endpoints ─────────────────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/"
)
async def list_document_versions(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
):
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    return db.get_document_versions(project_id, workspace_name, collection_id, document_id)


@router.post(
    "/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/{version_id}/restore/"
)
async def restore_document_version(
    project_id: str,
    workspace_name: str,
    collection_name: str,
    document_id: str,
    version_id: str,
    request: Request,
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)

    version = db.get_document_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")

    # Save current state before restoring
    existing = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    actor = get_actor(request)
    db.save_document_version(
        project_id,
        workspace_name,
        collection_id,
        document_id,
        existing,
        actor["uid"],
        actor["email"],
    )

    # Restore the version (keep current _status)
    restored = {**version["data"], "_status": existing.get("_status", "draft")}
    db.upsert_document(project_id, workspace_name, collection_id, document_id, restored)

    db_audit.log(
        action="update_document",
        resource_type="document",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=document_id,
        resource_name=collection_name,
        project_id=project_id,
        workspace_name=workspace_name,
        details={"restored_from_version": version["version_number"]},
        ip_address=get_client_ip(request),
    )
    return {**restored, "_id": document_id}
