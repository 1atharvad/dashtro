from typing import Any

from api.utils import get_audit_client, get_auth_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()


class ConnectionManager:
    """In-process registry of open Realtime Database WebSocket connections, keyed by project."""

    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(project_id, set()).add(ws)

    def disconnect(self, project_id: str, ws: WebSocket):
        conns = self._connections.get(project_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(project_id, None)

    async def broadcast(self, project_id: str, message: dict):
        for ws in list(self._connections.get(project_id, ())):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(project_id, ws)


manager = ConnectionManager()


@router.get("/projects/{project_id}/rtdb/")
@router.get("/projects/{project_id}/rtdb/{path:path}")
def get_rtdb(project_id: str, path: str = ""):
    return db.get_rtdb_path(project_id, path)


@router.put("/projects/{project_id}/rtdb/")
@router.put("/projects/{project_id}/rtdb/{path:path}")
async def put_rtdb(project_id: str, request: Request, path: str = ""):
    value: Any = await request.json()
    db.set_rtdb_path(project_id, path, value)
    await manager.broadcast(project_id, {"type": "put", "path": path, "value": value})

    actor = get_actor(request)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"path": path, "value": value}


@router.patch("/projects/{project_id}/rtdb/")
@router.patch("/projects/{project_id}/rtdb/{path:path}")
async def patch_rtdb(project_id: str, request: Request, path: str = ""):
    value = await request.json()
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="PATCH body must be a JSON object.")
    db.update_rtdb_path(project_id, path, value)
    await manager.broadcast(project_id, {"type": "patch", "path": path, "value": value})

    actor = get_actor(request)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return db.get_rtdb_path(project_id, path)


@router.delete("/projects/{project_id}/rtdb/", status_code=204)
@router.delete("/projects/{project_id}/rtdb/{path:path}", status_code=204)
async def delete_rtdb(project_id: str, request: Request, path: str = ""):
    db.delete_rtdb_path(project_id, path)
    await manager.broadcast(project_id, {"type": "delete", "path": path, "value": None})

    actor = get_actor(request)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=path or "/",
        project_id=project_id,
        ip_address=get_client_ip(request),
    )


@router.websocket("/projects/{project_id}/rtdb/ws")
async def rtdb_ws(websocket: WebSocket, project_id: str, token: str = ""):
    # CMSAuthMiddleware only wraps HTTP requests (Starlette's BaseHTTPMiddleware
    # doesn't run over WebSocket routes), so auth is verified here explicitly.
    db_auth = get_auth_client()
    try:
        db_auth.verify_id_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    await manager.connect(project_id, websocket)
    try:
        while True:
            # Connection is push-only from the server; drain/ignore any client frames.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(project_id, websocket)
