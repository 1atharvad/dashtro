from typing import Any

from api.utils import get_audit_client, get_auth_client, get_data_client
from api.utils.actor import get_client_ip
from api.utils.api_key_auth import require_api_key
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from routers.realtime_db import manager

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


def _key_actor(key_info: dict) -> tuple[str, str]:
    return f"apikey:{key_info['id']}", key_info["label"]


def _check_project_scope(key_info: dict, project_id: str):
    if key_info.get("project_id") and key_info["project_id"] != project_id:
        raise HTTPException(status_code=403, detail="API key is not scoped to this project")


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
    db.set_rtdb_path(project_id, path, value)
    await manager.broadcast(project_id, {"type": "put", "path": path, "value": value})

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
    db.update_rtdb_path(project_id, path, value)
    await manager.broadcast(project_id, {"type": "patch", "path": path, "value": value})

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
    return db.get_rtdb_path(project_id, path)


@router.delete("/projects/{project_id}/rtdb/", status_code=204)
@router.delete("/projects/{project_id}/rtdb/{path:path}", status_code=204)
async def delete_rtdb(
    project_id: str,
    request: Request,
    path: str = "",
    key_info: dict = Depends(require_api_key("write")),
):
    _check_project_scope(key_info, project_id)
    db.delete_rtdb_path(project_id, path)
    await manager.broadcast(project_id, {"type": "delete", "path": path, "value": None})

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
async def rtdb_ws(websocket: WebSocket, project_id: str, api_key: str = ""):
    # CMSAuthMiddleware doesn't apply here anyway (this router is mounted under
    # /api/sdk, outside its /api/cms/ scope) — verified explicitly regardless,
    # same as the JWT-based dashboard socket in routers/realtime_db.py.
    db_auth = get_auth_client()
    key_info = db_auth.verify_api_key(api_key)
    if not key_info or "read" not in (key_info.get("scopes") or []):
        await websocket.close(code=4401)
        return
    if key_info.get("project_id") and key_info["project_id"] != project_id:
        await websocket.close(code=4403)
        return

    await manager.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(project_id, websocket)
