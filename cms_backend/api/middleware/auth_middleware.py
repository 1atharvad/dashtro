from config import DEBUG
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# (method, path) pairs that don't require a token yet.
_PUBLIC_ROUTES = {
    ("POST", "/api/cms/auth/signup/"),
    ("POST", "/api/cms/auth/login/"),
    ("POST", "/api/cms/auth/refresh/"),
    ("GET", "/api/cms/auth/owner-exists/"),
    # Static, non-sensitive field-type registry fetched at app bootstrap,
    # before login — see cms-frontend/src/main.tsx.
    ("GET", "/api/cms/field-types/"),
}


def _is_public_media(path: str) -> bool:
    return path.startswith("/api/cms/media/files/")


class CMSAuthMiddleware(BaseHTTPMiddleware):
    """Enforces JWT auth on every /api/cms/ route except the public whitelist."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api/cms/"):
            return await call_next(request)

        if (request.method, path) in _PUBLIC_ROUTES or (
            request.method == "GET" and _is_public_media(path)
        ):
            return await call_next(request)

        from api.utils import get_auth_client

        db_auth = get_auth_client()

        try:
            if DEBUG:
                id_token = db_auth.get_admin_token_id()
            else:
                authorization = request.headers.get("authorization")
                if not authorization or not authorization.startswith("Bearer "):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Authorization header missing or invalid"},
                    )
                id_token = authorization[len("Bearer ") :].strip()
            actor = db_auth.verify_id_token(id_token)
        except Exception as e:
            return JSONResponse(status_code=401, content={"detail": str(e)})

        request.state.actor = actor
        return await call_next(request)
