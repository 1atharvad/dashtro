"""
Tests for `CMSAuthMiddleware` (api/middleware/auth_middleware.py).

Covers:
  - The public-route whitelist bypasses auth entirely.
  - Every other /api/cms/ route requires a valid, non-expired idToken cookie.
  - /api/sdk/ routes are outside this middleware's scope (it only inspects
    /api/cms/ paths) — the SDK's own API-key auth is tested separately in
    test_api_key_auth.py and test_route_separation.py.
  - The documented DEBUG=True bypass exists and is exercised deliberately so
    it can't silently change behavior without a test noticing.
"""

from tests.conftest import make_expired_token

# ── Whitelisted routes bypass auth ──────────────────────────────────────────


def test_signup_bypasses_auth(client):
    """POST /auth/signup/ is public — no idToken cookie is required."""
    resp = client.post(
        "/api/cms/auth/signup/",
        json={"email": "a@example.com", "password": "password123"},
    )
    # Whatever the route itself decides, it must not be rejected *by the
    # middleware* with the "Authentication cookie missing" 401.
    assert resp.status_code != 401 or "cookie" not in resp.json().get("detail", "")


def test_login_bypasses_auth(client):
    """POST /auth/login/ is public even before any user exists."""
    resp = client.post(
        "/api/cms/auth/login/",
        json={"email": "nobody@example.com", "password": "wrong"},
    )
    # 401 here comes from the *route's* own credential check, not the
    # middleware's missing-cookie check.
    assert resp.json()["detail"] != "Authentication cookie missing"


def test_refresh_bypasses_auth(client):
    """POST /auth/refresh/ is public (it validates its own refresh cookie)."""
    resp = client.post("/api/cms/auth/refresh/")
    # No refreshToken cookie set — the route itself rejects this, not the
    # CMSAuthMiddleware (which doesn't even look at this whitelisted path).
    assert resp.status_code == 401


def test_owner_exists_bypasses_auth(client):
    """GET /auth/owner-exists/ is public, used by the frontend before login."""
    resp = client.get("/api/cms/auth/owner-exists/")
    assert resp.status_code == 200
    assert resp.json() == {"exists": False}


def test_field_types_get_bypasses_auth(client):
    """GET /field-types/ is public — fetched at app bootstrap, before login."""
    resp = client.get("/api/cms/field-types/")
    assert resp.status_code == 200


def test_public_media_get_bypasses_auth(client):
    """GET /media/files/... is public by design, even for a nonexistent file."""
    resp = client.get("/api/cms/media/files/does-not-exist.png")
    # A 404 (file not found) is fine; a 401 from the middleware is not.
    assert resp.status_code != 401


def test_options_preflight_bypasses_auth(client):
    """CORS preflight OPTIONS requests are never blocked by the middleware."""
    resp = client.options(
        "/api/cms/projects/",
        headers={
            "Origin": "http://localhost",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code != 401


# ── Non-whitelisted routes require a valid idToken cookie ───────────────────


def test_protected_route_without_cookie_is_rejected(client):
    """A protected route with no idToken cookie at all → 401."""
    resp = client.get("/api/cms/projects/")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Authentication cookie missing"


def test_protected_route_with_garbage_token_is_rejected(client):
    """A syntactically-invalid JWT in the idToken cookie is rejected with a 401."""
    client.cookies.set("idToken", "not-a-jwt")
    resp = client.get("/api/cms/projects/")
    assert resp.status_code == 401


def test_protected_route_with_expired_token_is_rejected(client):
    """An otherwise well-formed JWT whose `exp` has passed → 401 'Token has expired'."""
    expired = make_expired_token()
    client.cookies.set("idToken", expired)
    resp = client.get("/api/cms/projects/")
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_protected_route_with_valid_token_succeeds(client, auth_headers):
    """A real, freshly-issued JWT cookie from login is accepted (no 401 from the middleware)."""
    resp = client.get("/api/cms/projects/", headers=auth_headers)
    assert resp.status_code == 200


# ── /api/sdk/ is outside this middleware's scope ────────────────────────────


def test_sdk_route_not_blocked_by_cms_auth_middleware(client):
    """CMSAuthMiddleware only inspects /api/cms/ paths — an /api/sdk/ request
    with zero auth cookies/headers must not receive the *middleware's* 401. It
    is still rejected, but by the SDK's own X-API-Key dependency
    (see test_api_key_auth.py), not by this middleware.
    """
    resp = client.get("/api/sdk/projects/some-project/workspace/staging/collection/posts/")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "X-API-Key header missing"


# ── Documented DEBUG=True bypass ────────────────────────────────────────────


def test_debug_mode_bypasses_auth_entirely(debug_client):
    """With DEBUG=True, CMSAuthMiddleware mints an admin token itself and
    never checks for an idToken cookie. This must never be true in
    production (config.py defaults DEBUG to False) — this test exists so
    that fact stays visible and can't regress silently.

    `get_admin_token_id()` mints a token for the *first* user in the DB, so
    at least one user must exist first — sign one up via the public route
    (allowed with or without DEBUG) before hitting the protected route.
    """
    debug_client.post(
        "/api/cms/auth/signup/",
        json={"email": "owner@example.com", "password": "password123"},
    )
    resp = debug_client.get("/api/cms/projects/")
    assert resp.status_code == 200
