"""
Tests for the Realtime Database (RTDB) fixes: the shared tree-operation
module (api/utils/rtdb_tree.py), the new push endpoint, and the API-key
scoping added to routers/sdk_realtime_db.py.

Before this session: a non-numeric key written under an existing list node
silently discarded the key and appended at the wrong index instead of
erroring; a root PUT of a non-dict value silently wiped the tree to `{}`
instead of erroring; there was no `push` operation (only index-addressed
list children, which reindex on delete); and a collection-scoped API key
had full, unrestricted RTDB access (no equivalent of check_key_scope
existed for RTDB paths). These tests pin down the fixed behavior.

The existing live-instance RTDB test (test_live_instance.py's
test_live_rtdb_crud) is opt-in (`-m live`, a real deployed instance) and
stays as the end-to-end smoke test; these run against the fast in-process
`client` fixture instead, same as the rest of this suite.
"""

from tests.test_sdk_documents import _create_api_key, _create_project

CMS_RTDB_URL = "/api/cms/projects/{project_id}/rtdb/{path}"
SDK_RTDB_URL = "/api/sdk/projects/{project_id}/rtdb/{path}"


def _cms_url(project_id: str, path: str = "") -> str:
    return CMS_RTDB_URL.format(project_id=project_id, path=path)


def _sdk_url(project_id: str, path: str = "") -> str:
    return SDK_RTDB_URL.format(project_id=project_id, path=path)


# ── CMS (JWT-authenticated) basic CRUD — fast equivalent of the live test ──


def test_cms_rtdb_crud(client, auth_headers):
    project_id = _create_project(client, auth_headers)

    set_resp = client.put(_cms_url(project_id, "counter/"), json={"count": 1}, headers=auth_headers)
    assert set_resp.status_code == 200, set_resp.text

    get_resp = client.get(_cms_url(project_id, "counter/"), headers=auth_headers)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["count"] == 1

    patch_resp = client.patch(
        _cms_url(project_id, "counter/"), json={"count": 2}, headers=auth_headers
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert client.get(_cms_url(project_id, "counter/"), headers=auth_headers).json()["count"] == 2

    delete_resp = client.delete(_cms_url(project_id, "counter/"), headers=auth_headers)
    assert delete_resp.status_code == 204, delete_resp.text
    assert client.get(_cms_url(project_id, "counter/"), headers=auth_headers).json() is None


# ── Correctness fixes ───────────────────────────────────────────────────────


def test_root_put_of_non_dict_value_is_rejected(client, auth_headers):
    """Before the fix: PUT / with a non-dict value silently wiped the whole
    tree to {} instead of erroring."""
    project_id = _create_project(client, auth_headers)
    client.put(_cms_url(project_id, "existing/"), json={"a": 1}, headers=auth_headers)

    resp = client.put(_cms_url(project_id, ""), json=["not", "a", "dict"], headers=auth_headers)
    assert resp.status_code == 400, resp.text

    # The pre-existing data must survive the rejected write.
    still_there = client.get(_cms_url(project_id, "existing/"), headers=auth_headers)
    assert still_there.json() == {"a": 1}


def test_dict_key_under_list_node_is_rejected_not_corrupted(client, auth_headers):
    """Before the fix: writing a non-numeric key under a list node silently
    discarded the key and appended at len(node) instead of erroring."""
    project_id = _create_project(client, auth_headers)
    client.put(_cms_url(project_id, "items/"), json=["a", "b"], headers=auth_headers)

    resp = client.put(_cms_url(project_id, "items/named/"), json="x", headers=auth_headers)
    assert resp.status_code == 400, resp.text

    # The list must be unchanged — no phantom appended value.
    items = client.get(_cms_url(project_id, "items/"), headers=auth_headers).json()
    assert items == ["a", "b"]


def test_numeric_index_write_into_list_still_works(client, auth_headers):
    """Confirm the fix didn't break legitimate index-addressed list writes."""
    project_id = _create_project(client, auth_headers)
    client.put(_cms_url(project_id, "items/"), json=["a", "b"], headers=auth_headers)

    resp = client.put(_cms_url(project_id, "items/1/"), json="B", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert client.get(_cms_url(project_id, "items/"), headers=auth_headers).json() == ["a", "B"]


# ── Push (generated-key children) ───────────────────────────────────────────


def test_push_generates_unique_key_and_appends(client, auth_headers):
    project_id = _create_project(client, auth_headers)

    first = client.post(
        _cms_url(project_id, "messages/"), json={"text": "hi"}, headers=auth_headers
    )
    assert first.status_code == 200, first.text
    first_key = first.json()["key"]
    assert first_key

    second = client.post(
        _cms_url(project_id, "messages/"), json={"text": "there"}, headers=auth_headers
    )
    second_key = second.json()["key"]
    assert second_key != first_key

    messages = client.get(_cms_url(project_id, "messages/"), headers=auth_headers).json()
    assert messages[first_key]["text"] == "hi"
    assert messages[second_key]["text"] == "there"


def test_deleting_one_pushed_child_does_not_shift_others(client, auth_headers):
    """The whole point of push over index-addressed lists: removing one
    child never changes another child's address."""
    project_id = _create_project(client, auth_headers)
    key_a = client.post(_cms_url(project_id, "messages/"), json="a", headers=auth_headers).json()[
        "key"
    ]
    key_b = client.post(_cms_url(project_id, "messages/"), json="b", headers=auth_headers).json()[
        "key"
    ]

    del_resp = client.delete(_cms_url(project_id, f"messages/{key_a}/"), headers=auth_headers)
    assert del_resp.status_code == 204, del_resp.text

    # key_b's own address is untouched by deleting key_a.
    still_b = client.get(_cms_url(project_id, f"messages/{key_b}/"), headers=auth_headers)
    assert still_b.json() == "b"


def test_push_into_non_empty_list_is_rejected(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    client.put(_cms_url(project_id, "items/"), json=["a"], headers=auth_headers)

    resp = client.post(_cms_url(project_id, "items/"), json="b", headers=auth_headers)
    assert resp.status_code == 400, resp.text


# ── API-key scoping for RTDB (SDK routes) ───────────────────────────────────


def test_collection_scoped_api_key_denied_rtdb_get(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    key = _create_api_key(client, auth_headers, project_id=project_id, collections=["posts"])

    resp = client.get(_sdk_url(project_id, ""), headers={"X-API-Key": key})
    assert resp.status_code == 403, resp.text


def test_collection_scoped_api_key_denied_rtdb_write(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    key = _create_api_key(client, auth_headers, project_id=project_id, collections=["posts"])

    resp = client.put(_sdk_url(project_id, "x/"), json=1, headers={"X-API-Key": key})
    assert resp.status_code == 403, resp.text


def test_project_scoped_key_without_collection_restriction_allowed(client, auth_headers):
    project_id = _create_project(client, auth_headers)
    key = _create_api_key(client, auth_headers, project_id=project_id, collections=None)

    resp = client.put(_sdk_url(project_id, "x/"), json=1, headers={"X-API-Key": key})
    assert resp.status_code == 200, resp.text

    get_resp = client.get(_sdk_url(project_id, "x/"), headers={"X-API-Key": key})
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json() == 1


def test_key_scoped_to_other_project_denied(client, auth_headers):
    project_id = _create_project(client, auth_headers, name="A")
    other_project_id = _create_project(client, auth_headers, name="B")
    key = _create_api_key(client, auth_headers, project_id=other_project_id, collections=None)

    resp = client.get(_sdk_url(project_id, ""), headers={"X-API-Key": key})
    assert resp.status_code == 403, resp.text
