"""
Tests that document writes store media URLs as relative paths.

Reads re-absolutify /api/cms/media/ paths against the requesting host, so a
backup exported over HTTP carries the source environment's domain in every
media URL. Importing that backup must not persist the foreign host.
"""

import pytest
from routers.documents import _relativize_media

from .test_sdk_documents import CMS_DOC_ITEM_URL, DOC_ITEM_URL, DOC_URL, _setup

LOCAL_MEDIA = "https://local.atharvadevasthali.com/api/cms/media/files/a1.webp"
RELATIVE_MEDIA = "/api/cms/media/files/a1.webp"
# GET absolutifies stored-relative paths against CMS_PUBLIC_URL, which the
# fixture below pins to a host different from LOCAL_MEDIA's: a document stored
# with the foreign host would read back unchanged and fail the assertions.
PUBLIC_URL = "https://cms.example.com"
READ_BACK_MEDIA = f"{PUBLIC_URL}{RELATIVE_MEDIA}"


@pytest.fixture
def public_url(client, monkeypatch):
    """Pin the host that reads absolutify media paths against."""
    monkeypatch.setattr("routers.documents.CMS_PUBLIC_URL", PUBLIC_URL)


def test_relativize_strips_host_from_cms_and_sdk_media_urls():
    """Absolute /api/cms and /api/sdk media URLs lose scheme+host, path is kept."""
    assert _relativize_media(LOCAL_MEDIA) == RELATIVE_MEDIA
    assert (
        _relativize_media("http://localhost:8000/api/sdk/media/files/b2.png")
        == "/api/sdk/media/files/b2.png"
    )


def test_relativize_recurses_into_dicts_and_lists():
    """Nested compound fields and lists are rewritten too."""
    data = {"cover": {"url": LOCAL_MEDIA, "alt_text": "x"}, "gallery": [{"url": LOCAL_MEDIA}]}
    assert _relativize_media(data) == {
        "cover": {"url": RELATIVE_MEDIA, "alt_text": "x"},
        "gallery": [{"url": RELATIVE_MEDIA}],
    }


def test_relativize_leaves_other_urls_and_values_alone():
    """Non-media external URLs, relative paths, and non-strings are untouched."""
    for value in (
        "https://example.com/photo.png",
        "https://example.com/not/api/cms/media/files/a.png",
        RELATIVE_MEDIA,
        42,
        None,
        True,
    ):
        assert _relativize_media(value) == value


def test_sdk_create_document_stores_media_url_relative(client, auth_headers, public_url):
    """An absolute media URL sent to the SDK create route is persisted relative."""
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "cover", "_type": "Image"}]
    )
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"_id": "d1", "title": "Hi", "cover": {"url": LOCAL_MEDIA}},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    stored = client.get(
        CMS_DOC_ITEM_URL.format(project_id=project_id, workspace_name="staging", document_id="d1"),
        headers=auth_headers,
    )
    assert stored.status_code == 200, stored.text
    assert stored.json()["cover"]["url"] == READ_BACK_MEDIA


def test_sdk_update_document_stores_media_url_relative(client, auth_headers, public_url):
    """An absolute media URL sent to the SDK update route is persisted relative."""
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "cover", "_type": "Image"}]
    )
    client.post(
        DOC_URL.format(project_id=project_id),
        json={"_id": "d1", "title": "Hi"},
        headers=headers,
    )
    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id="d1"),
        json={"cover": {"url": LOCAL_MEDIA}},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    stored = client.get(
        CMS_DOC_ITEM_URL.format(project_id=project_id, workspace_name="staging", document_id="d1"),
        headers=auth_headers,
    )
    assert stored.json()["cover"]["url"] == READ_BACK_MEDIA


def test_cms_create_document_stores_media_url_relative(client, auth_headers, public_url):
    """The admin (JWT) create route relativizes media URLs as well."""
    project_id, _ = _setup(
        client, auth_headers, extra_fields=[{"_name": "cover", "_type": "Image"}]
    )
    resp = client.post(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/Posts/",
        json={"_id": "d2", "title": "Hi", "cover": {"url": LOCAL_MEDIA}},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text

    stored = client.get(
        CMS_DOC_ITEM_URL.format(project_id=project_id, workspace_name="staging", document_id="d2"),
        headers=auth_headers,
    )
    assert stored.json()["cover"]["url"] == READ_BACK_MEDIA
