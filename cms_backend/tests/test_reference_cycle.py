"""
Tests for the ancestor-id cycle guard on ReferenceDocument hydration
(routers/documents.py's `_resolve_references`/`_resolve_one_reference`).

Before this session, the only guard against a reference chain was a plain
depth counter (`level`/`max_depth`) — a genuine identity loop (A references
B, B references back to A) wasn't detected as a cycle, it just silently
unrolled up to `max_depth` hops and returned the same unresolved-reference
shape as a plain missing document. These tests pin down the new behavior:
a real cycle is created deliberately via the data layer (bypassing the
frontend's dropdown filter on purpose, since that filter is UX-only) and
must come back with a distinct `_cycle` marker instead of hanging, looping,
or being indistinguishable from "document not found." A sibling reference
to the same document from two different branches (a "diamond", not a loop)
must not be flagged.
"""

from tests.test_sdk_documents import CMS_DOC_ITEM_URL, DOC_URL, _setup


def _seed_self_referencing_post_schema(client, auth_headers):
    """Post schema (title: required String) + two ReferenceDocument fields
    ('related', 'related_other') pointing at the 'posts' collection itself.
    Returns (project_id, api_key_headers), same contract as _setup."""
    return _setup(
        client,
        auth_headers,
        extra_fields=[
            {"_name": "related", "_type": "ReferenceDocument", "_reference_schema": ["posts"]},
            {
                "_name": "related_other",
                "_type": "ReferenceDocument",
                "_reference_schema": ["posts"],
            },
        ],
    )


def test_get_document_detects_reference_cycle(client, auth_headers):
    """A -> B -> A: fetching A must flag the back-edge to A as a cycle,
    not silently re-walk it or return the plain 'unresolved' shape."""
    project_id, headers = _seed_self_referencing_post_schema(client, auth_headers)
    doc_a = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "A"}, headers=headers
    ).json()
    doc_b = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "B", "related": doc_a["_id"]},
        headers=headers,
    ).json()

    update_resp = client.put(
        f"/api/sdk/projects/{project_id}/workspace/staging/collection/posts/document/{doc_a['_id']}/",
        json={"related": doc_b["_id"]},
        headers=headers,
    )
    assert update_resp.status_code == 200, update_resp.text

    resp = client.get(
        CMS_DOC_ITEM_URL.format(
            project_id=project_id, workspace_name="staging", document_id=doc_a["_id"]
        ),
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    doc = resp.json()

    assert doc["related"]["_document_id"] == doc_b["_id"]
    assert doc["related"]["title"] == "B"
    # B's own 'related' points back at A — A is an ancestor on this exact
    # resolution path, so it must come back flagged, not re-resolved.
    back_edge = doc["related"]["related"]
    assert back_edge["_document_id"] == doc_a["_id"]
    assert back_edge.get("_cycle") is True
    assert "title" not in back_edge  # not silently re-hydrated


def test_get_document_resolves_non_cyclic_chain_fully(client, auth_headers):
    """A -> B -> C, no cycle: unaffected by the new guard, still resolves
    every hop within the default max_depth."""
    project_id, headers = _seed_self_referencing_post_schema(client, auth_headers)
    doc_c = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "C"}, headers=headers
    ).json()
    doc_b = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "B", "related": doc_c["_id"]},
        headers=headers,
    ).json()
    doc_a = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "A", "related": doc_b["_id"]},
        headers=headers,
    ).json()

    resp = client.get(
        CMS_DOC_ITEM_URL.format(
            project_id=project_id, workspace_name="staging", document_id=doc_a["_id"]
        ),
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    doc = resp.json()

    assert doc["related"]["title"] == "B"
    assert doc["related"]["related"]["title"] == "C"
    assert "_cycle" not in doc["related"]
    assert "_cycle" not in doc["related"]["related"]


def test_sibling_references_to_same_document_not_flagged_as_cycle(client, auth_headers):
    """A diamond, not a loop: two independent fields on the same document
    (siblings, not ancestor/descendant of each other) referencing the same
    target must both resolve normally — nothing is upstream of itself here."""
    project_id, headers = _seed_self_referencing_post_schema(client, auth_headers)
    doc_b = client.post(
        DOC_URL.format(project_id=project_id), json={"title": "B"}, headers=headers
    ).json()
    doc_a = client.post(
        DOC_URL.format(project_id=project_id),
        json={"title": "A", "related": doc_b["_id"], "related_other": doc_b["_id"]},
        headers=headers,
    ).json()

    resp = client.get(
        CMS_DOC_ITEM_URL.format(
            project_id=project_id, workspace_name="staging", document_id=doc_a["_id"]
        ),
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    doc = resp.json()

    assert doc["related"]["title"] == "B"
    assert doc["related_other"]["title"] == "B"
    assert "_cycle" not in doc["related"]
    assert "_cycle" not in doc["related_other"]
