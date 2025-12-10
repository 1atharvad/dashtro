from decouple import config
from .sqlite_client import SqliteData, SqliteAuth
from .audit_client import SqliteAuditClient

# postgres and mongodb backends are not yet migrated to the FastAPI data API
# (PostgresData/MongoDBData still expose the old Django/Firestore-era methods)
# so only sqlite is wired up for now.
_DB_TYPE = config('DB_TYPE', default='sqlite')
_SUPPORTED_DB_TYPES = ('sqlite',)


def get_data_client():
    if _DB_TYPE not in _SUPPORTED_DB_TYPES:
        raise NotImplementedError(f"DB_TYPE={_DB_TYPE!r} is not supported yet; only 'sqlite' is available")
    return SqliteData()


def get_auth_client():
    if _DB_TYPE not in _SUPPORTED_DB_TYPES:
        raise NotImplementedError(f"DB_TYPE={_DB_TYPE!r} is not supported yet; only 'sqlite' is available")
    return SqliteAuth()


def get_audit_client() -> SqliteAuditClient:
    return SqliteAuditClient()


__all__ = [
    'SqliteData', 'SqliteAuth', 'SqliteAuditClient',
    'get_data_client', 'get_auth_client', 'get_audit_client',
]
