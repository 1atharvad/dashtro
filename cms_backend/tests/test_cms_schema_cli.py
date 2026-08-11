"""
Round-trip tests for cms_backend/scripts/cms_schema.py's direct-DB-access
export/import commands (the `dashtro export/import schema|documents|media`
CLI, run without --base-url).

Rather than mock the data layer, these seed a project directly through
`get_data_client()` (the same calls routers/*.py make), export it to a
tmp_path backup dir, import it into a *different* project, and assert the
destination matches — proving the on-disk backup format round-trips through
real SqliteData, not just through whatever cms_schema.py assumes about it.

The HTTP-mode commands (--base-url, used against a remote instance) are
covered separately in test_cms_schema_cli_http.py against a real running
server, since they use urllib against an actual socket, not an in-process
data client.
"""

import sys

import pytest

PRODUCTION = "production"


def _evict():
    """Drop cached imports of cms_schema/api modules so the next fixture's env vars take effect."""
    for name in list(sys.modules):
        if name == "cms_backend.scripts.cms_schema" or name.startswith("api."):
            sys.modules.pop(name, None)


def _reset_singleton():
    """Clear the process-wide SqliteClient singleton so the next fixture gets its own fresh instance."""
    from api.utils.sqlite_client import SqliteClient

    SqliteClient._instance = None


@pytest.fixture
def cms_schema(tmp_path, monkeypatch):
    """A freshly (re)imported cms_schema module wired to an isolated, per-test SQLite database."""
    monkeypatch.setenv("DB_TYPE", "sqlite")
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("CMS_UPLOAD_DIR", str(tmp_path / "uploads"))

    _evict()
    _reset_singleton()

    import cms_backend.scripts.cms_schema as module

    yield module

    _reset_singleton()
    _evict()


@pytest.fixture
def db(cms_schema):
    """The same data client cms_schema's commands use, for seeding/inspecting test data directly."""
    from api.utils import get_data_client

    return get_data_client()


def _seed_post_schema(db, project_id: str) -> str:
    """A 'Post' schema with a single 'title' field, plus a 'posts' collection. Returns the collection id."""
    db.upsert_project(project_id, {"name": project_id})
    db.upsert_schema_field(
        project_id,
        "field-title",
        {
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_description": "",
            "_relation": "OneToOne",
            "_default_value": "",
            "_placeholder": "",
            "_nested_schema": "",
            "_reference_schema": [""],
            "_rich_text_wrapper": "",
            "_display_name": True,
            "_required": False,
            "_schema_name": "Post",
        },
    )
    collection_id = "coll-posts"
    db.upsert_collection(
        project_id,
        collection_id,
        {"_index": 1, "_collection_name": "posts", "_schema_name": "Post"},
    )
    db.upsert_document(
        project_id, PRODUCTION, collection_id, "_meta_data", {"_document_sequence": []}
    )
    return collection_id


def test_schema_export_import_round_trip(cms_schema, db, tmp_path):
    """A schema + collection exported from one project imports cleanly into a different, empty project."""
    _seed_post_schema(db, "proj-src")
    backup_dir = tmp_path / "backup"

    cms_schema.cmd_export("proj-src", backup_dir)

    assert (backup_dir / "schemas" / "Post.json").exists()
    assert (backup_dir / "collections.json").exists()

    # Import into a *different*, empty project — proves the backup is
    # self-contained (doesn't secretly depend on proj-src still existing).
    db.upsert_project("proj-dst", {"name": "proj-dst"})
    cms_schema.cmd_import("proj-dst", backup_dir)

    from api.utils.schema import get_schema_names

    assert get_schema_names(db.get_schema("proj-dst")) == ["Post"]
    collections = db.get_collections("proj-dst")
    assert {c["_collection_name"]: c["_schema_name"] for c in collections.values()} == {
        "posts": "Post"
    }


def test_schema_import_preserves_nested_and_reference_on_update(cms_schema, db, tmp_path):
    """_nested_schema/_reference_schema are environment-specific wiring — import
    must update everything else about a field but never touch those two keys."""
    _seed_post_schema(db, "proj-src")
    backup_dir = tmp_path / "backup"
    cms_schema.cmd_export("proj-src", backup_dir)

    # Live field already has _reference_schema set to something backup files won't carry.
    db.upsert_project("proj-dst", {"name": "proj-dst"})
    db.upsert_schema_field(
        "proj-dst",
        "field-title-dst",
        {
            "_index": 1,
            "_name": "title",
            "_type": "String",
            "_description": "old description",
            "_relation": "OneToOne",
            "_default_value": "",
            "_placeholder": "",
            "_nested_schema": "SomeNested",
            "_reference_schema": ["SomeSchema"],
            "_rich_text_wrapper": "",
            "_display_name": True,
            "_required": False,
            "_schema_name": "Post",
        },
    )

    cms_schema.cmd_import("proj-dst", backup_dir)

    from api.utils.schema import schema_jsonify

    fields = schema_jsonify(db.get_schema("proj-dst"), allowed_schema_name="Post")["Post"]
    field = next(f for f in fields if f["_name"] == "title")
    assert field["_nested_schema"] == "SomeNested"
    assert field["_reference_schema"] == ["SomeSchema"]
    assert field["_description"] == ""  # overwritten by the (blank) backup value


def test_documents_export_import_round_trip(cms_schema, db, tmp_path):
    """A document exported from one project imports into a different project with the same schema."""
    coll_id = _seed_post_schema(db, "proj-src")
    db.upsert_document(
        "proj-src", PRODUCTION, coll_id, "doc-1", {"title": "Hello", "_status": "draft"}
    )
    db.upsert_document(
        "proj-src",
        PRODUCTION,
        coll_id,
        "_meta_data",
        {"_document_sequence": ["doc-1"], "_document_statuses": {"doc-1": "draft"}},
    )

    backup_dir = tmp_path / "backup"
    cms_schema.cmd_export("proj-src", backup_dir)
    cms_schema.cmd_documents_export("proj-src", PRODUCTION, backup_dir)

    assert (backup_dir / "documents" / "posts" / "doc-1.json").exists()

    _seed_post_schema(db, "proj-dst")
    cms_schema.cmd_import("proj-dst", backup_dir)
    cms_schema.cmd_documents_import("proj-dst", PRODUCTION, backup_dir)

    coll_id_dst = next(
        cid for cid, c in db.get_collections("proj-dst").items() if c["_collection_name"] == "posts"
    )
    import asyncio

    doc = asyncio.run(db.fetch_document("proj-dst", PRODUCTION, coll_id_dst, "doc-1"))
    assert doc["title"] == "Hello"
    assert doc["_status"] == "draft"

    meta = asyncio.run(db.fetch_document("proj-dst", PRODUCTION, coll_id_dst, "_meta_data"))
    assert meta["_document_sequence"] == ["doc-1"]


def test_documents_import_merge_preserves_fields_absent_from_backup(cms_schema, db, tmp_path):
    """--merge overwrites fields present in the backup but leaves fields the target already had and the backup doesn't mention."""
    coll_id = _seed_post_schema(db, "proj-src")
    db.upsert_document(
        "proj-src", PRODUCTION, coll_id, "doc-1", {"title": "Hello", "_status": "draft"}
    )
    db.upsert_document(
        "proj-src",
        PRODUCTION,
        coll_id,
        "_meta_data",
        {"_document_sequence": ["doc-1"], "_document_statuses": {"doc-1": "draft"}},
    )
    backup_dir = tmp_path / "backup"
    cms_schema.cmd_documents_export("proj-src", PRODUCTION, backup_dir)

    coll_id_dst = _seed_post_schema(db, "proj-dst")
    # Target already has doc-1 with a field the backup knows nothing about.
    db.upsert_document(
        "proj-dst",
        PRODUCTION,
        coll_id_dst,
        "doc-1",
        {"title": "Old title", "subtitle": "keep-me", "_status": "draft"},
    )
    db.upsert_document(
        "proj-dst",
        PRODUCTION,
        coll_id_dst,
        "_meta_data",
        {"_document_sequence": ["doc-1"], "_document_statuses": {"doc-1": "draft"}},
    )

    cms_schema.cmd_documents_import("proj-dst", PRODUCTION, backup_dir, merge=True)

    import asyncio

    doc = asyncio.run(db.fetch_document("proj-dst", PRODUCTION, coll_id_dst, "doc-1"))
    assert doc["title"] == "Hello"  # overwritten by backup
    assert doc["subtitle"] == "keep-me"  # absent from backup, preserved by merge=True


def test_media_export_import_round_trip(cms_schema, db, tmp_path):
    """A media file referenced by an exported document is copied to the backup dir, then restored from it."""
    coll_id = _seed_post_schema(db, "proj-src")
    db.upsert_document(
        "proj-src",
        PRODUCTION,
        coll_id,
        "doc-1",
        {"title": "Hello", "image": "/api/sdk/media/files/photo.png", "_status": "draft"},
    )
    db.upsert_document(
        "proj-src",
        PRODUCTION,
        coll_id,
        "_meta_data",
        {"_document_sequence": ["doc-1"], "_document_statuses": {"doc-1": "draft"}},
    )

    backup_dir = tmp_path / "backup"
    cms_schema.cmd_documents_export("proj-src", PRODUCTION, backup_dir)

    upload_dir = cms_schema._UPLOAD_DIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "photo.png").write_bytes(b"fake-png-bytes")

    cms_schema.cmd_media_export(backup_dir)
    assert (backup_dir / "media" / "photo.png").read_bytes() == b"fake-png-bytes"

    (upload_dir / "photo.png").unlink()
    assert not (upload_dir / "photo.png").exists()

    cms_schema.cmd_media_import(backup_dir)
    assert (upload_dir / "photo.png").read_bytes() == b"fake-png-bytes"
