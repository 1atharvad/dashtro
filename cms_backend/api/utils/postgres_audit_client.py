import calendar as cal
import datetime
import uuid
from datetime import UTC

import psycopg2
import psycopg2.extras

from api.utils.postgres_client import PostgresClient


class PostgresAuditClient(PostgresClient):
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls, *args, **kwargs)
            cls._instance._ensure_table()
        return cls._instance

    def _ensure_table(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_audit_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                user_email TEXT NOT NULL DEFAULT 'anonymous',
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT DEFAULT '',
                resource_name TEXT DEFAULT '',
                project_id TEXT DEFAULT '',
                workspace_name TEXT DEFAULT '',
                details JSONB DEFAULT '{}'::jsonb,
                ip_address TEXT DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL
            );
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON cms_audit_logs(created_at DESC);"
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON cms_audit_logs(action);")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_resource_type ON cms_audit_logs(resource_type);"
        )
        self.connection.commit()
        cursor.close()

    def log(
        self,
        action: str,
        resource_type: str,
        user_id: str = "anonymous",
        user_email: str = "anonymous",
        resource_id: str = "",
        resource_name: str = "",
        project_id: str = "",
        workspace_name: str = "",
        details: dict | None = None,
        ip_address: str = "",
    ):
        log_id = str(uuid.uuid4().hex)
        created_at = datetime.datetime.now(tz=UTC)
        cursor = self.get_cursor()
        cursor.execute(
            """INSERT INTO cms_audit_logs
               (id, user_id, user_email, action, resource_type, resource_id, resource_name,
                project_id, workspace_name, details, ip_address, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                log_id,
                user_id,
                user_email,
                action,
                resource_type,
                resource_id,
                resource_name,
                project_id,
                workspace_name,
                psycopg2.extras.Json(details or {}),
                ip_address,
                created_at,
            ),
        )
        self.connection.commit()
        cursor.close()

    def get_logs(
        self,
        action: str | None = None,
        resource_type: str | None = None,
        project_id: str | None = None,
        user_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict:
        where_clauses = []
        params = []

        if action:
            where_clauses.append("action = %s")
            params.append(action)
        if resource_type:
            where_clauses.append("resource_type = %s")
            params.append(resource_type)
        if project_id:
            where_clauses.append("project_id = %s")
            params.append(project_id)
        if user_id:
            where_clauses.append("user_id = %s")
            params.append(user_id)
        if from_date:
            where_clauses.append("created_at >= %s")
            params.append(from_date)
        if to_date:
            where_clauses.append("created_at <= %s")
            params.append(to_date)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        cursor = self.get_cursor()
        cursor.execute(f"SELECT COUNT(*) AS count FROM cms_audit_logs {where_sql}", params)
        total = cursor.fetchone()["count"]

        cursor.execute(
            f"SELECT * FROM cms_audit_logs {where_sql} ORDER BY created_at DESC LIMIT %s OFFSET %s",
            [*params, limit, offset],
        )
        rows = cursor.fetchall()
        cursor.close()

        logs = []
        for r in rows:
            logs.append(
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "user_email": r["user_email"],
                    "action": r["action"],
                    "resource_type": r["resource_type"],
                    "resource_id": r["resource_id"],
                    "resource_name": r["resource_name"],
                    "project_id": r["project_id"],
                    "workspace_name": r["workspace_name"],
                    "details": r["details"] or {},
                    "ip_address": r["ip_address"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
            )

        return {"total": total, "logs": logs}

    def get_heatmap_data(self, year: int, month: int | None = None) -> list[dict]:
        """Return per-day operation counts and top action for a year or a single month."""
        if month:
            days_in_month = cal.monthrange(year, month)[1]
            start = f"{year:04d}-{month:02d}-01"
            end = f"{year:04d}-{month:02d}-{days_in_month:02d}"
        else:
            start = f"{year:04d}-01-01"
            end = f"{year:04d}-12-31"

        cursor = self.get_cursor()
        cursor.execute(
            """
            SELECT created_at::date AS day, action, COUNT(*) AS cnt
            FROM cms_audit_logs
            WHERE created_at::date BETWEEN %s AND %s
            GROUP BY day, action
            ORDER BY day, cnt DESC
            """,
            (start, end),
        )
        rows = cursor.fetchall()
        cursor.close()

        # Aggregate: total count per day + top action
        day_map: dict[str, dict] = {}
        for r in rows:
            day = r["day"].isoformat()
            if day not in day_map:
                day_map[day] = {"count": 0, "top_action": r["action"]}
            day_map[day]["count"] += r["cnt"]

        # Fill in every calendar day (zero counts included)
        result = []
        if month:
            days_in_month = cal.monthrange(year, month)[1]
            for d in range(1, days_in_month + 1):
                day_str = f"{year:04d}-{month:02d}-{d:02d}"
                entry = day_map.get(day_str, {"count": 0, "top_action": None})
                result.append(
                    {"date": day_str, "count": entry["count"], "top_action": entry["top_action"]}
                )
        else:
            current = datetime.date(year, 1, 1)
            end_date = datetime.date(year, 12, 31)
            while current <= end_date:
                day_str = current.isoformat()
                entry = day_map.get(day_str, {"count": 0, "top_action": None})
                result.append(
                    {"date": day_str, "count": entry["count"], "top_action": entry["top_action"]}
                )
                current += datetime.timedelta(days=1)

        return result
