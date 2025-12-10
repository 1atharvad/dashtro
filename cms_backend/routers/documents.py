import uuid
from typing import Any
from fastapi import APIRouter, Header, HTTPException, Request
from api.utils import get_data_client, get_audit_client
from api.utils.actor import try_get_actor, get_client_ip
from api.utils.schema import get_schema_for_collection

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()

PRODUCTION = 'production'


def _resolve_collection(project_id: str, collection_name: str):
    collections = db.get_collections(project_id)
    schema = db.get_schema(project_id)
    result = get_schema_for_collection(collection_name, collections, schema)
    if isinstance(result, dict) and 'error' in result:
        matches = [c for c in collections.values() if c.get('_schema_name') == collection_name]
        if len(matches) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"'{collection_name}' matches multiple collections; use a collection name instead of a schema name.",
            )
        if len(matches) == 1:
            fallback_name = matches[0].get('_collection_name')
            fallback = get_schema_for_collection(fallback_name, collections, schema)
            if not (isinstance(fallback, dict) and 'error' in fallback):
                return fallback
        raise HTTPException(status_code=400, detail=result['error'])
    return result


def _normalize(data):
    if isinstance(data, list) and data == ['']:
        return []
    return data




_TYPE_EMPTY: dict[str, Any] = {
    'Boolean': False,
    'Number': 0,
    'Image': None,
    'File': None,
    'URL': None,
}


def _apply_schema_defaults(data: dict, schema_fields: list[dict]) -> dict:
    for field in schema_fields:
        field_name = field['_name']
        field_type = field.get('_type', 'String')
        explicit_default = field.get('_default_value', '')
        current = data.get(field_name)

        if current is None or current == '' or current == [] or field_name not in data:
            if explicit_default not in ('', None):
                data[field_name] = explicit_default
            elif field_type in _TYPE_EMPTY:
                data[field_name] = _TYPE_EMPTY[field_type]
            else:
                data[field_name] = ''
    return data


async def _resolve_references(doc: dict, schema_fields: list[dict], project_id: str, workspace_name: str) -> dict:
    """Inline referenced documents in place of their IDs."""
    result = dict(doc)
    collections = db.get_collections(project_id)
    coll_by_name = {v['_collection_name']: k for k, v in collections.items()}

    for field in schema_fields:
        if field.get('_type') != 'ReferenceDocument':
            continue
        field_name = field['_name']
        ref_id = doc.get(field_name)
        if not ref_id or not isinstance(ref_id, str):
            continue
        ref_colls = [c for c in field.get('_reference_schema', []) if c]
        for coll_name in ref_colls:
            coll_id = coll_by_name.get(coll_name)
            if not coll_id:
                continue
            ref_doc = await db.fetch_document(project_id, workspace_name, coll_id, ref_id)
            if ref_doc:
                result[field_name] = ref_doc
                break
    return result


def _guard_production_write(workspace_name: str):
    if workspace_name == PRODUCTION:
        raise HTTPException(
            status_code=403,
            detail="Production workspace is read-only. Push content from another workspace."
        )


async def _get_meta(project_id: str, workspace_name: str, collection_id: str) -> tuple[list, dict]:
    meta = await db.fetch_document(project_id, workspace_name, collection_id, '_meta_data')
    document_ids = _normalize(meta['_document_sequence']) if meta else []
    document_statuses: dict = (meta.get('_document_statuses') or {}) if meta else {}
    return document_ids, document_statuses


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/")
async def get_collection(project_id: str, workspace_name: str, collection_name: str):
    collection_id, schema_name, schema_data = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)
    return {
        '_schema_name': schema_name,
        '_schema': schema_data,
        '_document_ids': document_ids,
        '_document_statuses': document_statuses,
    }


@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/")
async def get_document(project_id: str, workspace_name: str, collection_name: str, document_id: str, raw: bool = False):
    collection_id, _, schema_fields = _resolve_collection(project_id, collection_name)
    document_ids, _ = await _get_meta(project_id, workspace_name, collection_id)
    if document_id not in document_ids:
        raise HTTPException(status_code=404, detail="Document not found in the collection.")
    doc = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if doc:
        schema_keys = {f['_name'] for f in schema_fields} if schema_fields else set()
        if schema_fields:
            doc = _apply_schema_defaults(doc, schema_fields)
        if not raw:
            doc = await _resolve_references(doc, schema_fields, project_id, workspace_name)
        doc = {k: v for k, v in doc.items()
               if k in schema_keys or (v not in ('', [], None) and not (isinstance(v, str) and v.strip() == ''))}
    return doc


# ── Mutation endpoints ────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/", status_code=201)
async def create_document(
    project_id: str, workspace_name: str, collection_name: str,
    body: dict[str, Any], request: Request, authorization: str = Header(default=None),
):
    _guard_production_write(workspace_name)
    collection_id, _, schema_data = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    doc_id = body.get('_id') or str(uuid.uuid4().hex[:20])
    body['_id'] = doc_id
    body.setdefault('_status', 'draft')
    body = _apply_schema_defaults(body, schema_data)

    db.upsert_document(project_id, workspace_name, collection_id, doc_id,
                       {k: v for k, v in body.items() if k != '_id'})

    document_statuses[doc_id] = body['_status']
    db.upsert_document(project_id, workspace_name, collection_id, '_meta_data', {
        '_document_sequence': [*document_ids, doc_id],
        '_document_statuses': document_statuses,
    })

    actor = try_get_actor(authorization)
    db_audit.log(action='create_document', resource_type='document', user_id=actor['uid'],
                 user_email=actor['email'], resource_id=doc_id, resource_name=collection_name,
                 project_id=project_id, workspace_name=workspace_name, ip_address=get_client_ip(request))
    return body


@router.put("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/")
async def update_document(
    project_id: str, workspace_name: str, collection_name: str, document_id: str,
    body: dict[str, Any], request: Request, authorization: str = Header(default=None),
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
    actor = try_get_actor(authorization)
    db.save_document_version(project_id, workspace_name, collection_id, document_id,
                             existing, actor['uid'], actor['email'])

    for key, value in body.items():
        existing[key] = value
    existing['_id'] = document_id

    # Sync status in meta if it changed
    if '_status' in body:
        document_statuses[document_id] = body['_status']
        db.upsert_document(project_id, workspace_name, collection_id, '_meta_data', {
            '_document_sequence': document_ids,
            '_document_statuses': document_statuses,
        })

    db.upsert_document(project_id, workspace_name, collection_id, document_id,
                       {k: v for k, v in existing.items() if k != '_id'})

    db_audit.log(action='update_document', resource_type='document', user_id=actor['uid'],
                 user_email=actor['email'], resource_id=document_id, resource_name=collection_name,
                 project_id=project_id, workspace_name=workspace_name, ip_address=get_client_ip(request))
    return existing


@router.patch("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/")
async def update_document_status(
    project_id: str, workspace_name: str, collection_name: str, document_id: str,
    body: dict[str, Any], request: Request, authorization: str = Header(default=None),
):
    _guard_production_write(workspace_name)
    status = body.get('_status')
    if status not in ('draft', 'published'):
        raise HTTPException(status_code=400, detail="_status must be 'draft' or 'published'.")

    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=404, detail="Document not found.")

    existing = await db.fetch_document(project_id, workspace_name, collection_id, document_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    existing['_status'] = status
    db.upsert_document(project_id, workspace_name, collection_id, document_id,
                       {k: v for k, v in existing.items() if k != '_id'})
    document_statuses[document_id] = status
    db.upsert_document(project_id, workspace_name, collection_id, '_meta_data', {
        '_document_sequence': document_ids,
        '_document_statuses': document_statuses,
    })

    actor = try_get_actor(authorization)
    db_audit.log(action='update_document', resource_type='document', user_id=actor['uid'],
                 user_email=actor['email'], resource_id=document_id, resource_name=collection_name,
                 project_id=project_id, workspace_name=workspace_name,
                 details={'_status': status}, ip_address=get_client_ip(request))
    return {**existing, '_id': document_id}


@router.delete("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/", status_code=204)
async def delete_document(
    project_id: str, workspace_name: str, collection_name: str, document_id: str,
    request: Request, authorization: str = Header(default=None),
):
    _guard_production_write(workspace_name)
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    document_ids, document_statuses = await _get_meta(project_id, workspace_name, collection_id)

    if document_id not in document_ids:
        raise HTTPException(status_code=400, detail="Document id doesn't exist.")

    updated_ids = [i for i in document_ids if i != document_id]
    document_statuses.pop(document_id, None)
    db.upsert_document(project_id, workspace_name, collection_id, '_meta_data', {
        '_document_sequence': updated_ids,
        '_document_statuses': document_statuses,
    })
    db.delete_document(project_id, workspace_name, collection_id, document_id)

    actor = try_get_actor(authorization)
    db_audit.log(action='delete_document', resource_type='document', user_id=actor['uid'],
                 user_email=actor['email'], resource_id=document_id, resource_name=collection_name,
                 project_id=project_id, workspace_name=workspace_name, ip_address=get_client_ip(request))


# ── Version endpoints ─────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/")
async def list_document_versions(
    project_id: str, workspace_name: str, collection_name: str, document_id: str,
):
    collection_id, _, _ = _resolve_collection(project_id, collection_name)
    return db.get_document_versions(project_id, workspace_name, collection_id, document_id)


@router.post("/projects/{project_id}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/versions/{version_id}/restore/")
async def restore_document_version(
    project_id: str, workspace_name: str, collection_name: str,
    document_id: str, version_id: str,
    request: Request, authorization: str = Header(default=None),
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

    actor = try_get_actor(authorization)
    db.save_document_version(project_id, workspace_name, collection_id, document_id,
                             existing, actor['uid'], actor['email'])

    # Restore the version (keep current _status)
    restored = {**version['data'], '_status': existing.get('_status', 'draft')}
    db.upsert_document(project_id, workspace_name, collection_id, document_id, restored)

    db_audit.log(action='update_document', resource_type='document', user_id=actor['uid'],
                 user_email=actor['email'], resource_id=document_id, resource_name=collection_name,
                 project_id=project_id, workspace_name=workspace_name,
                 details={'restored_from_version': version['version_number']},
                 ip_address=get_client_ip(request))
    return {**restored, '_id': document_id}
