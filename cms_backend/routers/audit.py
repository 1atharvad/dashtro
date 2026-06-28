import csv
import io
from datetime import UTC, datetime

from api.utils import get_audit_client
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from routers.auth import _get_user

router = APIRouter()
db_audit = get_audit_client()


@router.get("/audit-logs/heatmap/")
def get_heatmap(
    year: int = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    authorization: str = Header(default=None),
):
    try:
        _get_user(authorization)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    resolved_year = year or datetime.now(tz=UTC).year
    return db_audit.get_heatmap_data(year=resolved_year, month=month)


@router.get("/audit-logs/export/")
def export_audit_logs(
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    authorization: str = Header(default=None),
):
    try:
        _get_user(authorization)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    result = db_audit.get_logs(
        action=action,
        resource_type=resource_type,
        project_id=project_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        limit=10000,
        offset=0,
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "created_at",
            "user_email",
            "user_id",
            "action",
            "resource_type",
            "resource_id",
            "resource_name",
            "project_id",
            "workspace_name",
            "ip_address",
        ],
    )
    writer.writeheader()
    for log in result["logs"]:
        writer.writerow({k: log.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    filename = f"audit-log-{datetime.now(tz=UTC).strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit-logs/")
def list_audit_logs(
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str = Header(default=None),
):
    try:
        _get_user(authorization)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    return db_audit.get_logs(
        action=action,
        resource_type=resource_type,
        project_id=project_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )
