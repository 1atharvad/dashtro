from fastapi import Header, HTTPException


def require_api_key(operation: str):
    """Dependency factory: verifies X-API-Key and that it carries `operation` ('read'/'write')."""

    def _dependency(x_api_key: str = Header(default=None)) -> dict:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="X-API-Key header missing")
        from api.utils import get_auth_client

        db_auth = get_auth_client()
        key_info = db_auth.verify_api_key(x_api_key)
        if not key_info:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key")
        if operation not in (key_info.get("scopes") or []):
            raise HTTPException(
                status_code=403, detail=f"API key does not have '{operation}' access"
            )
        return key_info

    return _dependency


def check_key_scope(key_info: dict, project_id: str, collection_name: str):
    """Raises 403 if the key is scoped to a different project or collection set."""
    if key_info.get("project_id") and key_info["project_id"] != project_id:
        raise HTTPException(status_code=403, detail="API key is not scoped to this project")
    collections = key_info.get("collections") or []
    if collections and collection_name not in collections:
        raise HTTPException(status_code=403, detail="API key is not scoped to this collection")
