"""
Tests for schema-based validation on routers/sdk_documents.py's document
write endpoints (create_document/update_document) — the API-key-authorized
surface MCP tools call.

Before this session, create_document/update_document accepted the raw
request body verbatim with zero validation: no check that a data key
corresponds to a real schema field, no type-checking of values, no
enforcement of `_required`, and no protection against a caller setting
system-owned keys (`_id`, `_status`) to arbitrary values. See
ARCHITECTURE.md's "Key naming convention" and "Where validation lives"
sections for the design principle these tests pin down.
"""


def _create_project(client, auth_headers, name="Blog"):
    resp = client.post("/api/cms/projects/", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["_id"]


def _create_api_key(client, auth_headers, **overrides):
    body = {
        "label": "test key",
        "project_id": None,
        "collections": None,
        "scopes": ["read", "write"],
    }
    body.update(overrides)
    resp = client.post("/api/cms/auth/api-keys/", json=body, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["key"]


def _seed_post_schema_and_collection(client, auth_headers, project_id, extra_fields=()):
    """Create a 'Post' schema (title: required String) plus any extra_fields
    (each a dict of schema-field kwargs), and a 'posts' collection backed by
    it. Returns nothing — callers use fixed names."""
    client.post(
        f"/api/cms/projects/{project_id}/schema/",
        json={
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_schema_name": "Post",
            "_required": True,
        },
        headers=auth_headers,
    )
    for i, field in enumerate(extra_fields, start=2):
        body = {"_index": i, "_schema_name": "Post", **field}
        resp = client.post(
            f"/api/cms/projects/{project_id}/schema/", json=body, headers=auth_headers
        )
        assert resp.status_code == 201, resp.text
    coll = client.post(
        f"/api/cms/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers=auth_headers,
    )
    assert coll.status_code == 201, coll.text


def _create_workspace(client, auth_headers, project_id, workspace_name="staging"):
    resp = client.post(
        f"/api/cms/projects/{project_id}/workspaces/",
        json={"workspace_name": workspace_name},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text


def _setup(client, auth_headers, extra_fields=()):
    """Project + API key + Post schema/collection + staging workspace.
    Returns (project_id, headers) where headers carries the API key."""
    project_id = _create_project(client, auth_headers)
    api_key = _create_api_key(client, auth_headers)
    _seed_post_schema_and_collection(client, auth_headers, project_id, extra_fields)
    _create_workspace(client, auth_headers, project_id)
    return project_id, {"X-API-Key": api_key}


DOC_URL = "/api/sdk/projects/{project_id}/workspace/staging/collection/posts/"
DOC_ITEM_URL = (
    "/api/sdk/projects/{project_id}/workspace/staging/collection/posts/document/{document_id}/"
)


def test_create_document_rejects_unknown_field(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "bogus_field": "x"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_rejects_underscore_key_in_data(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "_secret": "x"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_rejects_invalid_status(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "_status": "not-a-real-status"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_rejects_missing_required_field(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_rejects_empty_string_for_required_field(client, auth_headers):
    """A required field present but empty ("") must count as missing, not satisfied —
    matching _apply_schema_defaults' own definition of "empty"."""
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": ""},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_accepts_valid_data(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["title"] == "Hi"


def test_create_document_wrong_scalar_types(client, auth_headers):
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "views", "_type": "Number"}]
    )
    # String field given a number
    resp = client.post(DOC_URL.format(project_id=project_id), json={"title": 123}, headers=headers)
    assert resp.status_code == 400, resp.text
    # Number field given a string
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "views": "three"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    # Number field given a bool (bool is an int subclass in Python — must still be rejected)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "views": True},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    # valid
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "views": 3},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


def test_create_document_boolean_accepts_real_bool_and_true_false_strings(client, auth_headers):
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "featured", "_type": "Boolean"}]
    )
    for value in (True, False, "true", "false"):
        resp = client.post(
            DOC_URL.format(project_id=project_id),
            json={"title": "Hi", "featured": value},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "featured": "yes"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_reference_document_shapes(client, auth_headers):
    project_id, headers = _setup(
        client,
        auth_headers,
        extra_fields=[
            {"_name": "author", "_type": "ReferenceDocument", "_reference_schema": ["authors"]},
            {
                "_name": "tags",
                "_type": "ReferenceDocument",
                "_relation": "OneToMany",
                "_reference_schema": ["authors"],
            },
        ],
    )
    # OneToOne (default): single id string
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "author": "doc123"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    # OneToOne given an object instead of a string -> rejected
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "author": {"id": "doc123"}},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text

    # OneToMany: list of id strings
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "tags": ["a", "b"]},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    # OneToMany given a bare string instead of a list -> rejected
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "tags": "a"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_nested_document_recursive_validation(client, auth_headers):
    project_id, headers = _setup(
        client,
        auth_headers,
        extra_fields=[
            {"_name": "section", "_type": "NestedDocument", "_nested_schema": "Section"},
        ],
    )
    # Section schema: 'heading' required String
    resp = client.post(
        f"/api/cms/projects/{project_id}/schema/",
        json={
            "_index": 1,
            "_name": "heading",
            "_type": "String",
            "_schema_name": "Section",
            "_required": True,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text

    # valid nested object
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "section": {"heading": "A heading"}},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    # nested object missing its own required field -> rejected
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "section": {}},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text

    # nested value not an object -> rejected
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "section": "not an object"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_compound_image_type(client, auth_headers):
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "cover", "_type": "Image"}]
    )
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "cover": {"url": "http://x", "alt_text": "a photo"}},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "cover": {"url": "http://x", "bogus_subfield": "z"}},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text

    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi", "cover": "not an object"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_create_document_honors_client_supplied_id(client, auth_headers):
    """Deliberate exception (see ARCHITECTURE.md): a client-supplied _id is
    honored on create, not rejected — cms_schema.py's backup/restore CLI
    depends on this to recreate documents under their original id."""
    project_id, headers = _setup(client, auth_headers)
    resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"_id": "my-custom-id", "title": "Hi"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["_id"] == "my-custom-id"


def test_update_document_rejects_id_change(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    create_resp = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "Hi"}, headers=headers
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id=doc_id),
        json={"_id": "different-id"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_update_document_rejects_invalid_status(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    create_resp = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "Hi"}, headers=headers
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id=doc_id),
        json={"_status": "not-a-real-status"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_update_document_rejects_other_underscore_keys(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    create_resp = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "Hi"}, headers=headers
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id=doc_id),
        json={"_something_else": "x"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_update_document_partial_update_does_not_spuriously_require_untouched_fields(
    client, auth_headers
):
    """Updating one field shouldn't force resending every required field —
    the required-check must run against the merged/final document, not the
    partial body alone."""
    project_id, headers = _setup(
        client, auth_headers, extra_fields=[{"_name": "views", "_type": "Number"}]
    )
    create_resp = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "Hi"},
        headers=headers,
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id=doc_id),
        json={"views": 42},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "Hi"
    assert resp.json()["views"] == 42


def test_update_document_rejects_unknown_field(client, auth_headers):
    project_id, headers = _setup(client, auth_headers)
    create_resp = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "Hi"}, headers=headers
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        DOC_ITEM_URL.format(project_id=project_id, document_id=doc_id),
        json={"bogus_field": "x"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


# ── Parity check: the JWT-authenticated /api/cms path gets the same validation ──


def test_cms_create_document_rejects_unknown_field(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    _seed_post_schema_and_collection(client, auth_headers, project_id)
    _create_workspace(client, auth_headers, project_id)

    resp = client.post(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/posts/",
        json={"title": "Hi", "bogus_field": "x"},
        headers=auth_headers,
    )
    assert resp.status_code == 400, resp.text


def test_cms_create_document_rejects_missing_required_field(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    _seed_post_schema_and_collection(client, auth_headers, project_id)
    _create_workspace(client, auth_headers, project_id)

    resp = client.post(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/posts/",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 400, resp.text


def test_cms_update_document_rejects_id_change(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    _seed_post_schema_and_collection(client, auth_headers, project_id)
    _create_workspace(client, auth_headers, project_id)

    create_resp = client.post(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/posts/",
        json={"title": "Hi"},
        headers=auth_headers,
    )
    doc_id = create_resp.json()["_id"]

    resp = client.put(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/posts/document/{doc_id}/",
        json={"_id": "different-id"},
        headers=auth_headers,
    )
    assert resp.status_code == 400, resp.text
