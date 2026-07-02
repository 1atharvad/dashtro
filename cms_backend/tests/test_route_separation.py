"""
Architecture-boundary tests: the two auth mechanisms (CMS JWT, SDK API key)
must never be interchangeable, even though both are ultimately backed by the
same SqliteAuth client. This is the concrete regression test for the whole
point of PLAN.md's SDK/API security work — a logged-in CMS user's JWT must
not grant access to /api/sdk/, and a valid API key must not grant access to
/api/cms/.
"""

SDK_URL = "/api/sdk/projects/proj-1/workspace/staging/collection/posts/"
CMS_URL = "/api/cms/projects/"


def test_valid_jwt_without_api_key_rejected_on_sdk_route(client, auth_headers):
    """A legitimately logged-in CMS user's Bearer JWT, with no X-API-Key
    header, must be rejected on an /api/sdk/ route.
    """
    resp = client.get(SDK_URL, headers=auth_headers)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "X-API-Key header missing"


def test_valid_api_key_without_jwt_rejected_on_cms_route(client, auth_headers):
    """A valid, correctly-scoped API key, with no Authorization/Bearer
    header, must be rejected on an /api/cms/ route.
    """
    create_resp = client.post(
        "/api/cms/auth/api-keys/",
        json={"label": "test key", "scopes": ["read", "write"]},
        headers=auth_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    api_key = create_resp.json()["key"]

    resp = client.get(CMS_URL, headers={"X-API-Key": api_key})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Authorization header missing or invalid"
