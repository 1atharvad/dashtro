def get_actor(request) -> dict:
    """Return the actor verified by CMSAuthMiddleware for this request."""
    return request.state.actor


def get_client_ip(request) -> str:
    """Extract the real client IP from a FastAPI Request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else ""
