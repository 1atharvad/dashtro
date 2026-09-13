"""
Tests for the forgot-password / reset-password flow (routers/auth.py).

Covers:
  - /auth/forgot-password/ never reveals whether an email is registered.
  - A registered email actually triggers an email send (captured via a fake
    email client, never a real SMTP/Resend call).
  - /auth/reset-password/ accepts a valid token, rejects garbage/expired
    tokens, and — since the token is a stateless single-use design (it embeds
    a fingerprint of the *current* password hash) — rejects a token reused
    after the password it was issued for has already changed.
"""

import re
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from tests.conftest import TEST_JWT_SECRET


@pytest.fixture
def captured_emails(monkeypatch):
    """Replaces get_email_client() with a fake that records
    send_password_reset_email calls instead of hitting real SMTP/Resend.
    """
    sent = []

    class _FakeEmailClient:
        def send_password_reset_email(self, to, reset_url, logo_url):
            sent.append({"to": to, "reset_url": reset_url, "logo_url": logo_url})

    import routers.auth as auth_module

    monkeypatch.setattr(auth_module, "get_email_client", lambda: _FakeEmailClient())
    return sent


def _extract_token(reset_url: str) -> str:
    match = re.search(r"token=([^&]+)", reset_url)
    assert match, f"no token found in {reset_url}"
    return match.group(1)


def test_forgot_password_registered_email_sends_reset_link(client, signup_owner, captured_emails):
    resp = client.post("/api/cms/auth/forgot-password/", json={"email": signup_owner["email"]})
    assert resp.status_code == 200
    assert resp.json() == {"message": "If that email is registered, a reset link has been sent."}

    assert len(captured_emails) == 1
    assert captured_emails[0]["to"] == signup_owner["email"]
    assert "/reset-password/?token=" in captured_emails[0]["reset_url"]


def test_forgot_password_unregistered_email_gives_identical_response_and_sends_nothing(
    client, captured_emails
):
    """The response must not let a caller distinguish a registered email from
    an unregistered one — otherwise the endpoint becomes an account-enumeration
    oracle."""
    resp = client.post("/api/cms/auth/forgot-password/", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert resp.json() == {"message": "If that email is registered, a reset link has been sent."}
    assert captured_emails == []


def test_reset_password_with_valid_token_updates_password(client, signup_owner, captured_emails):
    client.post("/api/cms/auth/forgot-password/", json={"email": signup_owner["email"]})
    token = _extract_token(captured_emails[0]["reset_url"])

    resp = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": token, "new_password": "brand-new-password-123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"message": "Password updated"}

    new_login = client.post(
        "/api/cms/auth/login/",
        json={"email": signup_owner["email"], "password": "brand-new-password-123"},
    )
    assert new_login.status_code == 200

    old_login = client.post(
        "/api/cms/auth/login/",
        json={"email": signup_owner["email"], "password": "correct-horse-battery-staple"},
    )
    assert old_login.status_code == 401


def test_reset_password_token_is_single_use(client, signup_owner, captured_emails):
    """The token embeds a fingerprint of the password hash it was issued
    against, so it stops verifying the moment that hash changes — reusing the
    same token for a second reset must fail."""
    client.post("/api/cms/auth/forgot-password/", json={"email": signup_owner["email"]})
    token = _extract_token(captured_emails[0]["reset_url"])

    first = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": token, "new_password": "first-new-password-1"},
    )
    assert first.status_code == 200, first.text

    second = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": token, "new_password": "second-new-password-2"},
    )
    assert second.status_code == 400
    assert "already been used" in second.json()["detail"]


def test_reset_password_rejects_garbage_token(client):
    resp = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": "not-a-jwt", "new_password": "whatever-12345"},
    )
    assert resp.status_code == 400


def test_reset_password_rejects_expired_token(client, signup_owner):
    import routers.auth as auth_module

    user = auth_module.db_auth.get_user_by_email(signup_owner["email"])
    now_ts = int((datetime.now(tz=UTC) - timedelta(hours=1)).timestamp())
    expired_token = jwt.encode(
        {
            "uid": user["uid"],
            "purpose": "password_reset",
            "pwd_sig": auth_module._pwd_sig(user["password_hash"]),
            "exp": now_ts - 1,
            "iat": now_ts - 900,
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )

    resp = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": expired_token, "new_password": "whatever-12345"},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


def test_reset_password_rejects_short_password(client, signup_owner, captured_emails):
    client.post("/api/cms/auth/forgot-password/", json={"email": signup_owner["email"]})
    token = _extract_token(captured_emails[0]["reset_url"])

    resp = client.post(
        "/api/cms/auth/reset-password/", json={"token": token, "new_password": "short"}
    )
    assert resp.status_code == 422


def test_forgot_password_and_reset_password_bypass_auth_middleware(client):
    """Both routes are public — CMSAuthMiddleware must not 401 them for
    missing an idToken cookie, since they're used by a signed-out visitor."""
    forgot_resp = client.post(
        "/api/cms/auth/forgot-password/", json={"email": "nobody@example.com"}
    )
    assert forgot_resp.status_code != 401 or "cookie" not in forgot_resp.json().get("detail", "")

    reset_resp = client.post(
        "/api/cms/auth/reset-password/",
        json={"token": "not-a-jwt", "new_password": "whatever-12345"},
    )
    assert reset_resp.status_code != 401 or "cookie" not in reset_resp.json().get("detail", "")
