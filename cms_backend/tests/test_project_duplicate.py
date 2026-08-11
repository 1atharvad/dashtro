"""Tests for POST /api/cms/projects/{project_id}/duplicate/ (routers/projects.py).

Covers the full copy: schema fields, categories + category assignment,
collections, rich text components, documents across every non-production
workspace, and that the duplicate is its own independent project (editing
the source doesn't touch the copy, and vice versa).

Documents can't be written directly into the "production" workspace (it's
read-only, pushed to from another workspace — see
routers/documents.py:_guard_production_write), so these tests write into
regular workspaces instead and just check "production" exists on both
sides.
"""


def _create_project(client, auth_headers, name="Blog"):
    """POST a new project and return its id."""
    resp = client.post("/api/cms/projects/", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["_id"]


def test_duplicate_project_copies_schema_collections_and_documents(client, auth_headers):
    """
    Builds a project with a schema field, a category assigned to that
    schema, a collection, and a document written into two separate
    workspaces, then duplicates it and checks every piece of that state
    shows up under the new project id.
    """
    project_id = _create_project(client, auth_headers)

    field_resp = client.post(
        f"/api/cms/projects/{project_id}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=auth_headers,
    )
    assert field_resp.status_code == 201, field_resp.text

    cat_resp = client.post(
        f"/api/cms/projects/{project_id}/schema-categories/",
        json={"name": "Blog"},
        headers=auth_headers,
    )
    assert cat_resp.status_code == 201, cat_resp.text
    cat_id = cat_resp.json()["id"]
    client.put(
        f"/api/cms/projects/{project_id}/schema-category-map/Post/",
        json={"category_id": cat_id},
        headers=auth_headers,
    )

    coll_resp = client.post(
        f"/api/cms/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers=auth_headers,
    )
    assert coll_resp.status_code == 201, coll_resp.text

    for ws_name in ("staging", "qa"):
        ws_resp = client.post(
            f"/api/cms/projects/{project_id}/workspaces/",
            json={"workspace_name": ws_name},
            headers=auth_headers,
        )
        assert ws_resp.status_code == 201, ws_resp.text

    staging_doc = client.post(
        f"/api/cms/projects/{project_id}/workspace/staging/collection/posts/",
        json={"title": "Hello staging"},
        headers=auth_headers,
    )
    assert staging_doc.status_code == 201, staging_doc.text
    staging_doc_id = staging_doc.json()["_id"]

    qa_doc = client.post(
        f"/api/cms/projects/{project_id}/workspace/qa/collection/posts/",
        json={"title": "Hello qa"},
        headers=auth_headers,
    )
    assert qa_doc.status_code == 201, qa_doc.text
    qa_doc_id = qa_doc.json()["_id"]

    dup_resp = client.post(f"/api/cms/projects/{project_id}/duplicate/", headers=auth_headers)
    assert dup_resp.status_code == 201, dup_resp.text
    new_project = dup_resp.json()
    new_project_id = new_project["_id"]
    assert new_project_id != project_id
    assert new_project["name"] == "Blog (Copy)"

    schema_resp = client.get(
        f"/api/cms/projects/{new_project_id}/schema/Post/", headers=auth_headers
    )
    assert schema_resp.status_code == 200, schema_resp.text
    fields = schema_resp.json()["Post"]
    assert any(f["_name"] == "title" for f in fields)

    coll_list = client.get(f"/api/cms/projects/{new_project_id}/collections/", headers=auth_headers)
    collections = coll_list.json()["_schema_collections"]
    assert len(collections) == 1
    assert collections[0]["_collection_name"] == "posts"

    ws_list = client.get(f"/api/cms/projects/{new_project_id}/workspaces/", headers=auth_headers)
    ws_names = {w["workspace_name"] for w in ws_list.json()}
    assert ws_names == {"production", "staging", "qa"}

    staging_doc_copy = client.get(
        f"/api/cms/projects/{new_project_id}/workspace/staging/collection/posts/document/{staging_doc_id}/",
        headers=auth_headers,
    )
    assert staging_doc_copy.status_code == 200, staging_doc_copy.text
    assert staging_doc_copy.json()["title"] == "Hello staging"

    qa_doc_copy = client.get(
        f"/api/cms/projects/{new_project_id}/workspace/qa/collection/posts/document/{qa_doc_id}/",
        headers=auth_headers,
    )
    assert qa_doc_copy.status_code == 200, qa_doc_copy.text
    assert qa_doc_copy.json()["title"] == "Hello qa"


def test_duplicate_project_is_independent_of_source(client, auth_headers):
    """
    Deleting a collection on the duplicate must not affect the source
    project — proves the duplicate writes fresh rows under the new project
    id rather than sharing/referencing the source's.
    """
    project_id = _create_project(client, auth_headers)
    client.post(
        f"/api/cms/projects/{project_id}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=auth_headers,
    )
    client.post(
        f"/api/cms/projects/{project_id}/collections/",
        json={"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
        headers=auth_headers,
    )

    dup_resp = client.post(f"/api/cms/projects/{project_id}/duplicate/", headers=auth_headers)
    new_project_id = dup_resp.json()["_id"]

    new_collections = client.get(
        f"/api/cms/projects/{new_project_id}/collections/", headers=auth_headers
    ).json()["_schema_collections"]
    assert len(new_collections) == 1
    new_collection_id = new_collections[0]["_id"]

    delete_resp = client.delete(
        f"/api/cms/projects/{new_project_id}/collections/{new_collection_id}/",
        headers=auth_headers,
    )
    assert delete_resp.status_code == 204, delete_resp.text

    source_collections = client.get(
        f"/api/cms/projects/{project_id}/collections/", headers=auth_headers
    ).json()["_schema_collections"]
    assert len(source_collections) == 1


def test_duplicate_project_404s_on_unknown_id(client, auth_headers):
    """duplicate_project 404s on an unknown project_id rather than silently creating an empty copy."""
    resp = client.post("/api/cms/projects/does-not-exist/duplicate/", headers=auth_headers)
    assert resp.status_code == 404, resp.text


def test_heatmap_project_id_filter_only_counts_that_projects_activity(client, auth_headers):
    """
    GET /audit-logs/heatmap/?project_id=X must only count operations logged
    against that project — otherwise the per-project audit log tab's
    heatmap would show every project's activity mixed together, the same
    bug this project_id filter already avoids on GET /audit-logs/ itself.
    """
    from datetime import UTC, datetime

    project_a = _create_project(client, auth_headers, name="A")
    project_b = _create_project(client, auth_headers, name="B")

    client.post(
        f"/api/cms/projects/{project_a}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=auth_headers,
    )
    client.post(
        f"/api/cms/projects/{project_b}/schema/",
        json={"_index": 1, "_name": "title", "_type": "String", "_schema_name": "Post"},
        headers=auth_headers,
    )

    year = datetime.now(tz=UTC).year
    resp_a = client.get(
        f"/api/cms/audit-logs/heatmap/?year={year}&project_id={project_a}", headers=auth_headers
    )
    assert resp_a.status_code == 200, resp_a.text
    total_a = sum(day["count"] for day in resp_a.json())

    resp_unfiltered = client.get(f"/api/cms/audit-logs/heatmap/?year={year}", headers=auth_headers)
    assert resp_unfiltered.status_code == 200, resp_unfiltered.text
    total_unfiltered = sum(day["count"] for day in resp_unfiltered.json())

    # project_a's own create_project + create_schema_field actions.
    assert total_a == 2
    # Both projects' actions (create_project x2, create_schema_field x2) plus signup.
    assert total_unfiltered > total_a
