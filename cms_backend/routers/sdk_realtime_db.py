import asyncio
import json
from typing import Any

from api.utils import get_audit_client, get_auth_client, get_data_client
from api.utils.actor import get_client_ip
from api.utils.api_key_auth import require_api_key
from api.utils.rtdb_tree import RtdbPathConflictError, RtdbSizeLimitError
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from routers.realtime_db import (
    _raise_for_rtdb_error,
    broadcast_in_background,
    get_rtdb_lock,
    manager,
)

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


def _key_actor(key_info: dict) -> tuple[str, str]:
    return f"apikey:{key_info['id']}", key_info["label"]


def _check_project_scope(key_info: dict, project_id: str):
    if key_info.get("project_id") and key_info["project_id"] != project_id:
        raise HTTPException(status_code=403, detail="API key is not scoped to this project")
    # RTDB has no "collection" concept for check_key_scope's usual collection-
    # restriction check to apply to — a key that's restricted to specific
    # collections has no defined subset of the RTDB tree it should be allowed
    # to touch, so it's denied RTDB access entirely rather than silently
    # getting full-tree access (which is what happened before this check
    # existed). Only unscoped-by-collection (optionally project-scoped) keys
    # can use RTDB.
    if key_info.get("collections"):
        raise HTTPException(
            status_code=403,
            detail="This API key is scoped to specific collections and cannot access the "
            "Realtime Database — use a key with no collection restriction.",
        )


@router.get("/projects/{project_id}/rtdb/")
@router.get("/projects/{project_id}/rtdb/{path:path}")
def get_rtdb(project_id: str, path: str = "", key_info: dict = Depends(require_api_key("read"))):
    _check_project_scope(key_info, project_id)
    return db.get_rtdb_path(project_id, path)


@router.put("/projects/{project_id}/rtdb/")
@router.put("/projects/{project_id}/rtdb/{path:path}")
async def put_rtdb(
    project_id: str,
    request: Request,
    path: str = "",
    key_info: dict = Depends(require_api_key("write")),
):
    _check_project_scope(key_info, project_id)
    value: Any = await request.json()
    async with get_rtdb_lock(project_id):
        try:
            db.set_rtdb_path(project_id, path, value)
        except (RtdbPathConflictError, RtdbSizeLimitError) as exc:
            _raise_for_rtdb_error(exc)
    broadcast_in_background(project_id, {"type": "put", "path": path, "value": value})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=user_id,
        user_email=user_email,
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"path": path, "value": value}


@router.post("/projects/{project_id}/rtdb/")
@router.post("/projects/{project_id}/rtdb/{path:path}")
async def push_rtdb(
    project_id: str,
    request: Request,
    path: str = "",
    key_info: dict = Depends(require_api_key("write")),
):
    _check_project_scope(key_info, project_id)
    value: Any = await request.json()
    async with get_rtdb_lock(project_id):
        try:
            key = db.push_rtdb_path(project_id, path, value)
        except (RtdbPathConflictError, RtdbSizeLimitError) as exc:
            _raise_for_rtdb_error(exc)
    child_path = f"{path}/{key}" if path else key
    broadcast_in_background(project_id, {"type": "put", "path": child_path, "value": value})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=user_id,
        user_email=user_email,
        resource_id=child_path,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"path": child_path, "key": key, "value": value}


@router.patch("/projects/{project_id}/rtdb/")
@router.patch("/projects/{project_id}/rtdb/{path:path}")
async def patch_rtdb(
    project_id: str,
    request: Request,
    path: str = "",
    key_info: dict = Depends(require_api_key("write")),
):
    _check_project_scope(key_info, project_id)
    value = await request.json()
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="PATCH body must be a JSON object.")
    async with get_rtdb_lock(project_id):
        try:
            db.update_rtdb_path(project_id, path, value)
        except (RtdbPathConflictError, RtdbSizeLimitError) as exc:
            _raise_for_rtdb_error(exc)
        result = db.get_rtdb_path(project_id, path)
    broadcast_in_background(project_id, {"type": "patch", "path": path, "value": value})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=user_id,
        user_email=user_email,
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return result


@router.delete("/projects/{project_id}/rtdb/", status_code=204)
@router.delete("/projects/{project_id}/rtdb/{path:path}", status_code=204)
async def delete_rtdb(
    project_id: str,
    request: Request,
    path: str = "",
    key_info: dict = Depends(require_api_key("write")),
):
    _check_project_scope(key_info, project_id)
    async with get_rtdb_lock(project_id):
        db.delete_rtdb_path(project_id, path)
    broadcast_in_background(project_id, {"type": "delete", "path": path, "value": None})

    user_id, user_email = _key_actor(key_info)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=user_id,
        user_email=user_email,
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.websocket("/projects/{project_id}/rtdb/ws")
async def rtdb_ws(websocket: WebSocket, project_id: str):
    # CMSAuthMiddleware doesn't apply here anyway (this router is mounted under
    # /api/sdk, outside its /api/cms/ scope). Auth is a first-message
    # handshake rather than a query param: an API key in the connection URL
    # rides along in server/proxy access logs and browser history, which a
    # short-lived JSON message right after connect avoids. The socket must be
    # accept()ed before any frame can be read, so it's accepted first and
    # closed immediately if the handshake fails, rather than left dangling.
    # The client must send `{"api_key": "..."}` as its first text frame
    # within 5s or the connection is closed.
    db_auth = get_auth_client()
    await websocket.accept()
    try:
        first_message = await asyncio.wait_for(websocket.receive_text(), timeout=5)
    except (TimeoutError, WebSocketDisconnect):
        await websocket.close(code=4401)
        return

    try:
        api_key = json.loads(first_message).get("api_key", "")
    except (ValueError, AttributeError):
        api_key = ""

    key_info = db_auth.verify_api_key(api_key)
    if not key_info or "read" not in (key_info.get("scopes") or []):
        await websocket.close(code=4401)
        return
    if key_info.get("project_id") and key_info["project_id"] != project_id:
        await websocket.close(code=4403)
        return
    if key_info.get("collections"):
        await websocket.close(code=4403)
        return

    manager.register(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(project_id, websocket)
