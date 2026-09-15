import asyncio
import logging
from typing import Any

from api.utils import get_audit_client, get_auth_client, get_data_client
from api.utils.actor import get_actor, get_client_ip
from api.utils.rtdb_tree import RtdbPathConflictError, RtdbSizeLimitError
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

router = APIRouter()
db = get_data_client()
db_audit = get_audit_client()
logger = logging.getLogger(__name__)


class ConnectionManager:
    """In-process registry of open Realtime Database WebSocket connections, keyed by project.

    In-process only: this does not fan out across multiple backend replicas —
    a client connected to one instance never sees a write made via another.
    Documented as a v1 limitation (single-instance deployments only) rather
    than solved here; see ARCHITECTURE.md."""

    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket):
        await ws.accept()
        self.register(project_id, ws)

    def register(self, project_id: str, ws: WebSocket):
        """Adds an already-`accept()`ed socket — for flows (like the API-key
        first-message handshake) that must accept before they can read the
        client's first frame to authenticate it."""
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
                logger.warning(
                    "RTDB broadcast failed for project %s, dropping connection",
                    project_id,
                    exc_info=True,
                )
                self.disconnect(project_id, ws)


manager = ConnectionManager()

# asyncio.create_task()'s return value must be kept referenced somewhere for
# the task's lifetime, or the event loop is free to garbage-collect it
# mid-flight (a documented asyncio gotcha, not a hypothetical one) — a
# broadcast task with no other reference could be collected before
# ws.send_json finishes for some/all clients, silently dropping the update.
# Keeping each task in this set (and letting it discard itself when done)
# is the pattern asyncio's own docs recommend for fire-and-forget tasks.
_background_tasks: set[asyncio.Task] = set()


def broadcast_in_background(project_id: str, message: dict) -> None:
    task = asyncio.create_task(manager.broadcast(project_id, message))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# One lock per project, shared with sdk_realtime_db.py (same underlying data) —
# serializes this process's own read-modify-write RTDB operations so two
# concurrent writes (even to unrelated paths) can't race and silently clobber
# each other. Does not extend across multiple backend replicas — see
# ConnectionManager's docstring above; the same limitation applies here.
_rtdb_locks: dict[str, asyncio.Lock] = {}


def get_rtdb_lock(project_id: str) -> asyncio.Lock:
    return _rtdb_locks.setdefault(project_id, asyncio.Lock())


def _raise_for_rtdb_error(exc: RtdbPathConflictError | RtdbSizeLimitError):
    """Converts a tree-operation error to its HTTP shape. Always called from
    an `except (RtdbPathConflictError, RtdbSizeLimitError) as exc:` clause —
    exc is guaranteed to be one of those two types there, so this doesn't
    re-check and re-raise anything else."""
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects/{project_id}/rtdb/")
@router.get("/projects/{project_id}/rtdb/{path:path}")
def get_rtdb(project_id: str, path: str = ""):
    return db.get_rtdb_path(project_id, path)


@router.put("/projects/{project_id}/rtdb/")
@router.put("/projects/{project_id}/rtdb/{path:path}")
async def put_rtdb(project_id: str, request: Request, path: str = ""):
    value: Any = await request.json()
    async with get_rtdb_lock(project_id):
        try:
            db.set_rtdb_path(project_id, path, value)
        except (RtdbPathConflictError, RtdbSizeLimitError) as exc:
            _raise_for_rtdb_error(exc)
    broadcast_in_background(project_id, {"type": "put", "path": path, "value": value})

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


@router.post("/projects/{project_id}/rtdb/")
@router.post("/projects/{project_id}/rtdb/{path:path}")
async def push_rtdb(project_id: str, request: Request, path: str = ""):
    """Append `value` as a new child under a generated key, rather than an
    explicit path — the recommended way to add an item to an ordered
    collection, since deleting a push-keyed child never shifts any sibling's
    address the way deleting a numeric list index does."""
    value: Any = await request.json()
    async with get_rtdb_lock(project_id):
        try:
            key = db.push_rtdb_path(project_id, path, value)
        except (RtdbPathConflictError, RtdbSizeLimitError) as exc:
            _raise_for_rtdb_error(exc)
    child_path = f"{path}/{key}" if path else key
    broadcast_in_background(project_id, {"type": "put", "path": child_path, "value": value})

    actor = get_actor(request)
    db_audit.log(
        action="rtdb_write",
        resource_type="rtdb",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_id=child_path,
        project_id=project_id,
        ip_address=get_client_ip(request),
    )
    return {"path": child_path, "key": key, "value": value}


@router.patch("/projects/{project_id}/rtdb/")
@router.patch("/projects/{project_id}/rtdb/{path:path}")
async def patch_rtdb(project_id: str, request: Request, path: str = ""):
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
    return result


@router.delete("/projects/{project_id}/rtdb/", status_code=204)
@router.delete("/projects/{project_id}/rtdb/{path:path}", status_code=204)
async def delete_rtdb(project_id: str, request: Request, path: str = ""):
    async with get_rtdb_lock(project_id):
        db.delete_rtdb_path(project_id, path)
    broadcast_in_background(project_id, {"type": "delete", "path": path, "value": None})

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
async def rtdb_ws(websocket: WebSocket, project_id: str):
    # CMSAuthMiddleware only wraps HTTP requests (Starlette's BaseHTTPMiddleware
    # doesn't run over WebSocket routes), so auth is verified here explicitly.
    # The idToken cookie rides along automatically on the WS handshake (same-origin).
    db_auth = get_auth_client()
    try:
        db_auth.verify_id_token(websocket.cookies.get("idToken", ""))
    except Exception:
        logger.warning("RTDB websocket auth rejected for project %s", project_id, exc_info=True)
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
