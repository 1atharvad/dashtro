from config import DEBUG


def try_get_actor(authorization: str | None) -> dict:
    """Extract the current actor from the Authorization header. Never raises."""
    from api.utils import get_auth_client
    db_auth = get_auth_client()
    try:
        if DEBUG:
            id_token = db_auth.get_admin_token_id()
        elif not authorization or not authorization.startswith("Bearer "):
            return {"uid": "anonymous", "email": "anonymous"}
        else:
            id_token = authorization[len("Bearer "):].strip()
        return db_auth.verify_id_token(id_token)
    except Exception:
        return {"uid": "anonymous", "email": "anonymous"}


def get_client_ip(request) -> str:
    """Extract the real client IP from a FastAPI Request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else ""
