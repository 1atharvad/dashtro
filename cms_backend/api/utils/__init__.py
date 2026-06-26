from decouple import config

from .audit_client import SqliteAuditClient
from .postgres_audit_client import PostgresAuditClient
from .postgres_client import PostgresAuth, PostgresData
from .sqlite_client import SqliteAuth, SqliteData

# mongodb is not yet migrated to the FastAPI data API, so it stays unsupported.
_DB_TYPE = config("DB_TYPE", default="sqlite")
_SUPPORTED_DB_TYPES = ("sqlite", "postgres")


def get_data_client():
    if _DB_TYPE == "postgres":
        return PostgresData()
    if _DB_TYPE == "sqlite":
        return SqliteData()
    raise NotImplementedError(
        f"DB_TYPE={_DB_TYPE!r} is not supported yet; use one of {_SUPPORTED_DB_TYPES}"
    )


def get_auth_client():
    if _DB_TYPE == "postgres":
        return PostgresAuth()
    if _DB_TYPE == "sqlite":
        return SqliteAuth()
    raise NotImplementedError(
        f"DB_TYPE={_DB_TYPE!r} is not supported yet; use one of {_SUPPORTED_DB_TYPES}"
    )


def get_audit_client() -> SqliteAuditClient | PostgresAuditClient:
    if _DB_TYPE == "postgres":
        return PostgresAuditClient()
    return SqliteAuditClient()


__all__ = [
    "SqliteData",
    "SqliteAuth",
    "SqliteAuditClient",
    "PostgresData",
    "PostgresAuth",
    "PostgresAuditClient",
    "get_data_client",
    "get_auth_client",
    "get_audit_client",
]
