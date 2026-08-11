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
    """
    Baseline round-trip for `dashtro export schema` / `dashtro import schema`
    in direct-DB mode: export the seeded 'Post' schema + 'posts' collection
    to a backup dir, then import that backup into a second, completely
    empty project.

    Importing into a *different* project (not the one exported from) is the
    important part — it proves the on-disk backup format is self-contained
    and doesn't secretly depend on data still present in the source
    project, which a same-project round-trip could hide.
    """
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
    """
    _nested_schema and _reference_schema are environment-specific wiring
    (which concrete schema/collection a reference field points at) rather
    than portable field definition — a backup file created against one
    environment shouldn't be able to clobber that wiring in another when
    imported, since the target schema/reference names it points at may not
    even exist there.

    Seeds a destination field whose _nested_schema/_reference_schema are
    already set to values the backup file doesn't know about, imports over
    it, and asserts those two keys are untouched while every other field
    (here, _description) is overwritten by whatever the backup carried —
    including overwriting it with a blank value, proving this isn't a
    "only overwrite if non-empty" merge, just a "preserve these two keys
    specifically" merge.
    """
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
    """
    Baseline round-trip for `dashtro export documents` / `dashtro import
    documents` in direct-DB mode: a document (plus the collection's
    _meta_data bookkeeping — _document_sequence, _document_statuses) is
    exported from one project and imported into a second project that has
    the same schema/collection already seeded.

    Checks both the document content (title, _status survive intact) and
    the meta document (_document_sequence includes the new id) — a bug in
    either half would let a document exist without being listable, or vice
    versa.
    """
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
    """
    `dashtro import documents --merge` is meant for restoring into a
    project that already has live data you don't want to lose — as opposed
    to the default replace mode, which is a full overwrite.

    Seeds the destination document with a field ("subtitle") the backup
    was never exported with, then imports with merge=True and checks that:
    (1) fields the backup *does* carry (title) win and overwrite the
    target's value, and (2) fields the backup doesn't mention (subtitle)
    survive untouched. A merge implementation that either overwrote
    everything or dropped everything not in the backup would both pass a
    naive "did the title update" check, so this test asserts on both
    fields specifically.
    """
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
    """
    `dashtro export media` doesn't take a --project-id — it works by
    scanning the documents a prior `export documents` already wrote to the
    backup dir for `/api/sdk/media/files/<name>` URLs, and only copies
    files actually referenced by exported content (uploads have no project
    association in storage, so this scan is the only way to know which
    files a given backup needs).

    Exports a document with an image field pointing at a real uploaded
    file, exports media (checking the file lands in the backup dir), then
    deletes the original from the upload dir and imports media back —
    proving both the "find what's referenced" and the "copy it back"
    halves work, not just one of them.
    """
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
