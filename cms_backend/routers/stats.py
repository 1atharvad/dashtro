"""Public, unauthenticated server status for the /stats page.

Lives outside /api/cms/ and /api/sdk/ on purpose: CMSAuthMiddleware only guards
/api/cms/, and this endpoint must stay reachable when logins or the database are
broken — that is exactly when it is needed. It exposes only coarse health numbers
(version, uptime, DB reachability/connection usage, process memory/threads) and
never error text, hostnames or credentials. The snapshot is rebuilt at most once
per _CACHE_TTL_SECONDS so the open endpoint can't be used to hammer the database.
"""

import os
import threading
import time

from api.utils import PostgresData, get_data_client
from config import APP_VERSION
from fastapi import APIRouter, Response

router = APIRouter()
db = get_data_client()

_CACHE_TTL_SECONDS = 10
_STARTED_AT = time.time()
_cache: dict = {"at": 0.0, "body": None}
_cache_lock = threading.Lock()


def _database_stats() -> dict:
    """Probe the database with a timed SELECT 1 and, on Postgres, report connection usage."""
    started = time.perf_counter()
    try:
        cursor = db.get_cursor()
        try:
            cursor.execute("SELECT 1")
            cursor.fetchone()
            stats = {
                "ok": True,
                "type": "postgres" if isinstance(db, PostgresData) else "sqlite",
                "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                "connections": None,
            }
            if isinstance(db, PostgresData):
                cursor.execute(
                    "SELECT count(*) AS used, current_setting('max_connections')::int AS max"
                    " FROM pg_stat_activity"
                )
                row = cursor.fetchone()
                stats["connections"] = {"used": row["used"], "max": row["max"]}
            return stats
        finally:
            cursor.close()
    except Exception:
        return {
            "ok": False,
            "type": "postgres" if isinstance(db, PostgresData) else "sqlite",
            "latency_ms": None,
            "connections": None,
        }


def _memory_rss_bytes() -> int | None:
    """Resident memory of this process from /proc, or None where /proc isn't available."""
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[1]) * os.sysconf("SC_PAGE_SIZE")
    except (OSError, ValueError, IndexError):
        return None


def _build_stats() -> dict:
    """Assemble a fresh status snapshot."""
    database = _database_stats()
    return {
        "status": "ok" if database["ok"] else "degraded",
        "version": APP_VERSION,
        "started_at": _STARTED_AT,
        "uptime_seconds": int(time.time() - _STARTED_AT),
        "generated_at": time.time(),
        "database": database,
        "process": {"memory_bytes": _memory_rss_bytes(), "threads": threading.active_count()},
    }


@router.get("/stats/")
def get_stats(response: Response):
    """Return the server status snapshot, rebuilt at most once per cache window."""
    response.headers["Cache-Control"] = "no-store"
    with _cache_lock:
        now = time.monotonic()
        if _cache["body"] is None or now - _cache["at"] >= _CACHE_TTL_SECONDS:
            _cache["body"] = _build_stats()
            _cache["at"] = now
        return _cache["body"]
