#!/usr/bin/env python3
"""
DashTro schema CLI — export and import schemas + collections directly via the DB.

Usage
-----
    dashtro export schema --project-id <id> [--backup-dir ./backup]
    dashtro import schema --project-id <id> [--backup-dir ./backup]
    dashtro export documents --project-id <id> --workspace <name> [--backup-dir ./backup]
    dashtro import documents --project-id <id> --workspace <name> [--backup-dir ./backup] [--merge]
    dashtro export media [--backup-dir ./backup]                    # run after 'export documents'
    dashtro import media [--backup-dir ./backup]

Full backup: run export schema, then export documents, then export media
(that order — media scans the just-exported document files for what to grab).
Restore: same three commands with import instead of export, same order.

Backup layout
-------------
    backup/
      schemas/
        BlogPost.json
        Author.json
      collections.json
      documents/
        <collection>/<doc_id>.json
      media/
        <uploaded-filename>          # only files referenced by exported documents

Each schema file:
    {
      "_meta_data": { "project_id": "...", "schema_name": "BlogPost", "folder_name": "Blog" },
      "fields": [{ "_name": "title", "_type": "String", "_index": 1, ... }]
    }

Each document file — content fields at the top level; everything that isn't
schema-defined content (status, ids, which project/collection/schema it came
from) lives under _meta_data instead of being mixed into the content:
    {
      "_meta_data": {
        "project_id": "...", "workspace_name": "production",
        "collection_name": "articles", "collection_id": "...",
        "document_id": "...", "schema_name": "BlogPost", "status": "draft"
      },
      "title": "...", ...
    }

collections.json:
    [{ "_collection_name": "articles", "_schema_name": "BlogPost" }, ...]

Import rules
------------
- Existing field (matched by _name): updated, but _nested_schema and
  _reference_schema are never overwritten — environment-specific wiring is preserved.
- New field: created with all values from the file.
- Folder: created automatically if it doesn't exist yet.
- Collections: imported after schemas so the schema-exists check passes.
"""

import argparse
import asyncio
import json
import mimetypes
import os
import re
import shutil
import sys
import uuid
from pathlib import Path

# ── Make backend importable regardless of where the CLI is invoked from ────────
_BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from api.utils import get_data_client  # noqa: E402
from api.utils.schema import get_schema_names, schema_jsonify  # noqa: E402
from models.collection import SchemaCollectionIn  # noqa: E402
from models.schema import SchemaFieldIn  # noqa: E402

_SKIP_EXPORT = {"_id", "_schema_name"}
_PRESERVE_IMPORT = {"_nested_schema", "_reference_schema"}
_META_KEY = "_meta_data"

# Mirrors routers/media.py's UPLOAD_DIR. Overridable via env var since this
# script may run on a host machine where /app/uploads isn't the real mount
# point (that path is a Docker-container convention, not a config.py setting).
_UPLOAD_DIR = Path(os.environ.get("CMS_UPLOAD_DIR", "/app/uploads"))

# Matches media URLs as stored in document fields, e.g. "/api/cms/media/files/<name>".
_MEDIA_URL_RE = re.compile(r"/media/files/([A-Za-z0-9_.\-]+)")


# ─── HTTP helpers (used when --base-url is provided) ──────────────────────────

import urllib.error
import urllib.request


def _request(method: str, url: str, payload: dict | None = None) -> dict | list:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {url}: {body}") from e


def _get(base: str, path: str) -> dict | list:
    return _request("GET", f"{base}{path}")


def _post(base: str, path: str, payload: dict) -> dict:
    return _request("POST", f"{base}{path}", payload)


def _put(base: str, path: str, payload: dict) -> dict:
    return _request("PUT", f"{base}{path}", payload)


# ─── Schema export ─────────────────────────────────────────────────────────────


def cmd_export(project_id: str, backup_dir: Path) -> None:
    db = get_data_client()
    schemas_dir = backup_dir / "schemas"
    schemas_dir.mkdir(parents=True, exist_ok=True)

    schema = db.get_schema(project_id)
    schema_names = get_schema_names(schema)
    categories = db.get_categories(project_id)  # {cat_id: {name: ...}}
    category_map = db.get_category_map(project_id)  # {schema_name: cat_id}

    print(f"Exporting {len(schema_names)} schema(s) → {schemas_dir}/")
    for name in schema_names:
        result = schema_jsonify(schema, allowed_schema_name=name, sort_indices=True)
        raw_fields = result.get(name, [])
        fields = [{k: v for k, v in f.items() if k not in _SKIP_EXPORT} for f in raw_fields]

        cat_id = category_map.get(name, "")
        folder = categories[cat_id]["name"] if cat_id and cat_id in categories else ""

        meta = {"project_id": project_id, "schema_name": name, "folder_name": folder}
        out_path = schemas_dir / f"{name}.json"
        out_path.write_text(json.dumps({_META_KEY: meta, "fields": fields}, indent=2))
        print(f"  ✓ {name}" + (f"  (folder: {folder})" if folder else ""))

    _export_collections(db, project_id, backup_dir)
    print("Done.")


# ─── Schema import ─────────────────────────────────────────────────────────────


def cmd_import(project_id: str, backup_dir: Path) -> None:
    db = get_data_client()
    schemas_dir = backup_dir / "schemas"
    if not schemas_dir.exists():
        print(f"Error: {schemas_dir} not found. Run export first.", file=sys.stderr)
        sys.exit(1)

    files = sorted(schemas_dir.glob("*.json"))
    if not files:
        print(f"No .json files in {schemas_dir}.", file=sys.stderr)
        sys.exit(1)

    categories = {v["name"]: k for k, v in db.get_categories(project_id).items()}  # name → id
    category_map = db.get_category_map(project_id)

    def ensure_category(name: str) -> str:
        if name in categories:
            return categories[name]
        cat_id = str(uuid.uuid4().hex[:16])
        db.upsert_category(project_id, cat_id, {"name": name})
        categories[name] = cat_id
        return cat_id

    print(f"Importing {len(files)} schema file(s) from {schemas_dir}/")

    for file in files:
        schema_name = file.stem
        data = json.loads(file.read_text())

        if isinstance(data, list):
            fields_from_file, folder_name = data, ""
        else:
            fields_from_file = data.get("fields", [])
            meta = data.get(_META_KEY) or {}
            folder_name = meta.get(
                "folder_name", data.get("_folder", "")
            )  # _folder: pre-_meta_data backups

        # Deduplicate by _name — keep first occurrence, warn on extras
        seen: set[str] = set()
        deduped = []
        for f in fields_from_file:
            n = f.get("_name")
            if n in seen:
                print(
                    f"    ⚠ Duplicate field '{n}' in file — keeping first occurrence",
                    file=sys.stderr,
                )
            else:
                seen.add(n)
                deduped.append(f)
        fields_from_file = deduped

        print(f"\n  [{schema_name}]  {len(fields_from_file)} field(s)")

        # Build live field map: _name → {_id, ...all stored fields}
        live_schema = db.get_schema(project_id)
        live_result = schema_jsonify(
            live_schema, allowed_schema_name=schema_name, sort_indices=True
        )
        live_by_name = {f["_name"]: f for f in live_result.get(schema_name, [])}

        file_field_names = set()

        for field in fields_from_file:
            field_name = field.get("_name")
            if not field_name:
                print("    ⚠ Skipping field with no _name", file=sys.stderr)
                continue

            file_field_names.add(field_name)

            if field_name in live_by_name:
                live = live_by_name[field_name]
                field_id = live["_id"]
                # Merge: file values win except for preserved keys
                merged = {**live}
                merged.pop("_id", None)
                for k, v in field.items():
                    if k not in _PRESERVE_IMPORT:
                        merged[k] = v
                merged["_schema_name"] = schema_name
                try:
                    validated = SchemaFieldIn.model_validate(merged)
                    db.upsert_schema_field(project_id, field_id, validated.to_storage())
                    print(f"    ~ {field_name}  (updated; nested/reference preserved)")
                except Exception as e:
                    print(f"    ✗ {field_name}  validation failed: {e}", file=sys.stderr)
            else:
                create_data = {**field, "_schema_name": schema_name}
                try:
                    validated = SchemaFieldIn.model_validate(create_data)
                    field_id = str(uuid.uuid4().hex[:20])
                    db.upsert_schema_field(project_id, field_id, validated.to_storage())
                    print(f"    + {field_name}  (created)")
                except Exception as e:
                    print(f"    ✗ {field_name}  validation failed: {e}", file=sys.stderr)

        # Remove fields that exist live but are absent from the file
        for field_name, live_field in live_by_name.items():
            if field_name not in file_field_names:
                db.delete_schema_field(project_id, live_field["_id"])
                print(f"    - {field_name}  (removed)")

        if folder_name:
            cat_id = ensure_category(folder_name)
            if category_map.get(schema_name) != cat_id:
                db.set_schema_category(project_id, schema_name, cat_id)
                category_map[schema_name] = cat_id
                print(f"    → folder: {folder_name}")

    _import_collections(db, project_id, backup_dir)
    print("\nDone.")


# ─── Collections (called by export/import automatically) ───────────────────────


def _export_collections(db, project_id: str, backup_dir: Path) -> None:
    collections = db.get_collections(project_id)
    exportable = [
        {"_collection_name": c["_collection_name"], "_schema_name": c["_schema_name"]}
        for c in sorted(collections.values(), key=lambda c: c.get("_index", 0))
    ]
    out_path = backup_dir / "collections.json"
    out_path.write_text(json.dumps(exportable, indent=2))
    print(f"\nExported {len(exportable)} collection(s) → {out_path}")


def _import_collections(db, project_id: str, backup_dir: Path) -> None:
    in_path = backup_dir / "collections.json"
    if not in_path.exists():
        print("\n  (no collections.json, skipping)")
        return

    from_file: list[dict] = json.loads(in_path.read_text())
    collections = db.get_collections(project_id)
    live = {c["_collection_name"]: {"id": cid, **c} for cid, c in collections.items()}
    valid_schemas = set(get_schema_names(db.get_schema(project_id)))

    print(f"\nImporting {len(from_file)} collection(s):")
    for i, col in enumerate(from_file, start=1):
        name = col["_collection_name"]
        schema_name = col["_schema_name"]

        if schema_name not in valid_schemas:
            print(f"  ✗ {name}  schema '{schema_name}' not found — skipping", file=sys.stderr)
            continue

        try:
            validated = SchemaCollectionIn.model_validate(
                {"_collection_name": name, "_schema_name": schema_name, "_index": i}
            )
            data = validated.to_storage()
        except Exception as e:
            print(f"  ✗ {name}  validation failed: {e}", file=sys.stderr)
            continue

        if name in live:
            db.upsert_collection(project_id, live[name]["id"], data)
            print(f"  ~ {name} → {schema_name}  (updated)")
        else:
            collection_id = str(uuid.uuid4().hex[:20])
            db.upsert_collection(project_id, collection_id, data)
            db.upsert_document(
                project_id, "production", collection_id, "_meta_data", {"_document_sequence": []}
            )
            print(f"  + {name} → {schema_name}  (created)")


# ─── HTTP-based schema export/import ──────────────────────────────────────────


def cmd_export_http(base_url: str, project_id: str, backup_dir: Path) -> None:
    schemas_dir = backup_dir / "schemas"
    schemas_dir.mkdir(parents=True, exist_ok=True)
    meta = _get(base_url, f"/projects/{project_id}/schema/")
    schema_names: list[str] = meta.get("_schema_names", [])
    cat_data = _get(base_url, f"/projects/{project_id}/schema-categories/")
    categories = {c["id"]: c["name"] for c in cat_data.get("categories", [])}
    category_map: dict = cat_data.get("category_map", {})
    print(f"Exporting {len(schema_names)} schema(s) → {schemas_dir}/")
    for name in schema_names:
        resp = _get(base_url, f"/projects/{project_id}/schema/{name}/")
        raw_fields = resp.get(name, []) if isinstance(resp, dict) else resp
        fields = [{k: v for k, v in f.items() if k not in _SKIP_EXPORT} for f in raw_fields]
        cat_id = category_map.get(name, "")
        folder = categories.get(cat_id, "") if cat_id else ""
        field_meta = {"project_id": project_id, "schema_name": name, "folder_name": folder}
        (schemas_dir / f"{name}.json").write_text(
            json.dumps({_META_KEY: field_meta, "fields": fields}, indent=2)
        )
        print(f"  ✓ {name}" + (f"  (folder: {folder})" if folder else ""))
    # collections
    cols = _get(base_url, f"/projects/{project_id}/collections/")
    exportable = [
        {"_collection_name": c["_collection_name"], "_schema_name": c["_schema_name"]}
        for c in cols.get("_schema_collections", [])
    ]
    (backup_dir / "collections.json").write_text(json.dumps(exportable, indent=2))
    print(f"\nExported {len(exportable)} collection(s) → collections.json")
    print("Done.")


def cmd_import_http(base_url: str, project_id: str, backup_dir: Path) -> None:
    schemas_dir = backup_dir / "schemas"
    if not schemas_dir.exists():
        print(f"Error: {schemas_dir} not found.", file=sys.stderr)
        sys.exit(1)
    files = sorted(schemas_dir.glob("*.json"))
    cat_data = _get(base_url, f"/projects/{project_id}/schema-categories/")
    live_cats: list[dict] = cat_data.get("categories", [])
    cat_map: dict = cat_data.get("category_map", {})

    def ensure_cat(name: str) -> str:
        for c in live_cats:
            if c["name"] == name:
                return c["id"]
        new_cat = _post(base_url, f"/projects/{project_id}/schema-categories/", {"name": name})
        live_cats.append(new_cat)
        return new_cat["id"]

    print(f"Importing {len(files)} schema file(s) via {base_url}")
    for file in files:
        schema_name = file.stem
        data = json.loads(file.read_text())
        fields_from_file = data if isinstance(data, list) else data.get("fields", [])
        field_meta = {} if isinstance(data, list) else (data.get(_META_KEY) or {})
        folder_name = (
            field_meta.get("folder_name", data.get("_folder", ""))
            if not isinstance(data, list)
            else ""
        )
        seen: set[str] = set()
        deduped = []
        for f in fields_from_file:
            n = f.get("_name")
            if n not in seen:
                seen.add(n)
                deduped.append(f)
        fields_from_file = deduped
        print(f"\n  [{schema_name}]  {len(fields_from_file)} field(s)")
        try:
            resp = _get(base_url, f"/projects/{project_id}/schema/{schema_name}/")
            live_fields = resp.get(schema_name, []) if isinstance(resp, dict) else resp
        except RuntimeError as e:
            live_fields = [] if "404" in str(e) else (_ for _ in ()).throw(e)
        live_by_name = {f["_name"]: f for f in live_fields}
        file_names = set()
        for field in fields_from_file:
            fn = field.get("_name")
            if not fn:
                continue
            file_names.add(fn)
            if fn in live_by_name:
                fid = live_by_name[fn]["_id"]
                payload = {k: v for k, v in field.items() if k not in _PRESERVE_IMPORT}
                try:
                    _put(base_url, f"/projects/{project_id}/schema/{fid}/", payload)
                    print(f"    ~ {fn}")
                except RuntimeError as e:
                    print(f"    ✗ {fn}: {e}", file=sys.stderr)
            else:
                try:
                    _post(
                        base_url,
                        f"/projects/{project_id}/schema/",
                        {**field, "_schema_name": schema_name},
                    )
                    print(f"    + {fn}")
                except RuntimeError as e:
                    print(f"    ✗ {fn}: {e}", file=sys.stderr)
        for fn, lf in live_by_name.items():
            if fn not in file_names:
                try:
                    _request("DELETE", f"{base_url}/projects/{project_id}/schema/{lf['_id']}/")
                    print(f"    - {fn}")
                except RuntimeError as e:
                    print(f"    ✗ delete {fn}: {e}", file=sys.stderr)
        if folder_name:
            cat_id = ensure_cat(folder_name)
            if cat_map.get(schema_name) != cat_id:
                _put(
                    base_url,
                    f"/projects/{project_id}/schema-category-map/{schema_name}/",
                    {"category_id": cat_id},
                )
                cat_map[schema_name] = cat_id
                print(f"    → folder: {folder_name}")
    # collections
    col_path = backup_dir / "collections.json"
    if col_path.exists():
        from_file = json.loads(col_path.read_text())
        cols = _get(base_url, f"/projects/{project_id}/collections/")
        live_cols = {c["_collection_name"]: c for c in cols.get("_schema_collections", [])}
        print(f"\nImporting {len(from_file)} collection(s):")
        for i, col in enumerate(from_file, start=1):
            name, sname = col["_collection_name"], col["_schema_name"]
            if name in live_cols:
                _put(
                    base_url,
                    f"/projects/{project_id}/collections/{live_cols[name]['_id']}/",
                    {
                        "_collection_name": name,
                        "_schema_name": sname,
                        "_index": live_cols[name].get("_index", i),
                    },
                )
                print(f"  ~ {name} → {sname}")
            else:
                _post(
                    base_url,
                    f"/projects/{project_id}/collections/",
                    {"_collection_name": name, "_schema_name": sname, "_index": i},
                )
                print(f"  + {name} → {sname}")
    print("\nDone.")


# ─── HTTP-based document export/import ────────────────────────────────────────


def _unwrap_references(doc: dict) -> dict:
    """Depth-limited reads wrap unresolved reference fields as {'_document_id': id}
    instead of a bare ID string; unwrap that back to a plain ID for storage-faithful backups."""

    def unwrap_one(v):
        return v["_document_id"] if isinstance(v, dict) and set(v.keys()) == {"_document_id"} else v

    return {
        k: [unwrap_one(i) for i in v] if isinstance(v, list) else unwrap_one(v)
        for k, v in doc.items()
    }


def cmd_documents_export_http(
    base_url: str, project_id: str, workspace_name: str, backup_dir: Path
) -> None:
    docs_dir = backup_dir / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    cols = _get(base_url, f"/projects/{project_id}/collections/")
    print(f"Exporting documents [{workspace_name}] via {base_url}")
    for col in cols.get("_schema_collections", []):
        coll_name = col["_collection_name"]
        coll_meta = _get(
            base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/"
        )
        doc_ids = [d for d in coll_meta.get("_document_ids", []) if d]
        if not doc_ids:
            print(f"  - {coll_name}  (no documents)")
            continue
        coll_dir = docs_dir / coll_name
        coll_dir.mkdir(exist_ok=True)
        for doc_id in doc_ids:
            doc = _get(
                base_url,
                f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/document/{doc_id}/?depth=1",
            )
            doc = _unwrap_references(doc)
            status = doc.pop("_status", "draft")
            doc.pop("_id", None)
            doc_meta = {
                "project_id": project_id,
                "workspace_name": workspace_name,
                "collection_name": coll_name,
                "collection_id": col.get("_id", ""),
                "document_id": doc_id,
                "schema_name": col.get("_schema_name", ""),
                "status": status,
            }
            (coll_dir / f"{doc_id}.json").write_text(
                json.dumps({_META_KEY: doc_meta, **doc}, indent=2)
            )
        print(f"  ✓ {coll_name}  ({len(doc_ids)} document(s))")
    print("Done.")


def cmd_documents_import_http(
    base_url: str, project_id: str, workspace_name: str, backup_dir: Path, merge: bool = False
) -> None:
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found.", file=sys.stderr)
        sys.exit(1)
    mode = "merge" if merge else "replace"
    print(f"Importing documents [{workspace_name}] via {base_url}  ({mode} mode)")
    for coll_dir in sorted(p for p in docs_dir.iterdir() if p.is_dir()):
        coll_name = coll_dir.name
        coll_meta = _get(
            base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/"
        )
        existing_ids = set(coll_meta.get("_document_ids", []))
        doc_files = sorted(coll_dir.glob("*.json"))
        print(f"\n  [{coll_name}]  {len(doc_files)} document(s)")
        for doc_file in doc_files:
            doc_id = doc_file.stem
            doc_data = json.loads(doc_file.read_text())
            doc_meta = doc_data.pop(_META_KEY, None)
            doc_data.pop("_id", None)
            # New-format files carry status in _meta_data; legacy files still
            # have a flat _status left in doc_data — either way it ends up set.
            if doc_meta is not None:
                doc_data["_status"] = doc_meta.get("status", "draft")
            else:
                doc_data.setdefault("_status", "draft")
            if doc_id in existing_ids:
                try:
                    # HTTP PUT always merges (backend only updates keys present in body)
                    _put(
                        base_url,
                        f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/document/{doc_id}/",
                        doc_data,
                    )
                    print(f"    ~ {doc_id}  (updated)")
                except RuntimeError as e:
                    print(f"    ✗ {doc_id}: {e}", file=sys.stderr)
            else:
                try:
                    _post(
                        base_url,
                        f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/",
                        {"_id": doc_id, **doc_data},
                    )
                    print(f"    + {doc_id}  (created)")
                except RuntimeError as e:
                    print(f"    ✗ {doc_id}: {e}", file=sys.stderr)
    print("\nDone.")


# ─── Documents export/import ──────────────────────────────────────────────────

# _status moves into _meta_data (it's bookkeeping, not schema-defined content).
_DOC_SKIP = {"_id", "_status"}


async def _export_docs_async(db, project_id: str, workspace_name: str, docs_dir: Path) -> None:
    collections = db.get_collections(project_id)
    if not collections:
        print("  (no collections found)")
        return
    for collection_id, coll_data in collections.items():
        coll_name = coll_data.get("_collection_name", "")
        if not coll_name:
            continue
        schema_name = coll_data.get("_schema_name", "")
        col_meta = await db.fetch_document(project_id, workspace_name, collection_id, "_meta_data")
        doc_ids = [d for d in (col_meta.get("_document_sequence", []) if col_meta else []) if d]
        if not doc_ids:
            print(f"  - {coll_name}  (no documents)")
            continue
        coll_dir = docs_dir / coll_name
        coll_dir.mkdir(exist_ok=True)
        for doc_id in doc_ids:
            doc = await db.fetch_document(project_id, workspace_name, collection_id, doc_id)
            if doc:
                clean = {k: v for k, v in doc.items() if k not in _DOC_SKIP}
                doc_meta = {
                    "project_id": project_id,
                    "workspace_name": workspace_name,
                    "collection_name": coll_name,
                    "collection_id": collection_id,
                    "document_id": doc_id,
                    "schema_name": schema_name,
                    "status": doc.get("_status", "draft"),
                }
                (coll_dir / f"{doc_id}.json").write_text(
                    json.dumps({_META_KEY: doc_meta, **clean}, indent=2)
                )
        print(f"  ✓ {coll_name}  ({len(doc_ids)} document(s))")


def cmd_documents_export(project_id: str, workspace_name: str, backup_dir: Path) -> None:
    db = get_data_client()
    docs_dir = backup_dir / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    print(f"Exporting documents [{workspace_name}] → {docs_dir}/")
    asyncio.run(_export_docs_async(db, project_id, workspace_name, docs_dir))
    print("Done.")


async def _import_docs_async(
    db, project_id: str, workspace_name: str, docs_dir: Path, merge: bool = False
) -> None:
    collections = db.get_collections(project_id)
    coll_by_name = {v["_collection_name"]: k for k, v in collections.items()}

    for coll_dir in sorted(p for p in docs_dir.iterdir() if p.is_dir()):
        coll_name = coll_dir.name
        if coll_name not in coll_by_name:
            print(f"  ✗ '{coll_name}' not found in collections — skipping", file=sys.stderr)
            continue
        collection_id = coll_by_name[coll_name]
        meta = await db.fetch_document(project_id, workspace_name, collection_id, "_meta_data")
        existing_ids: set[str] = set(meta.get("_document_sequence", []) if meta else [])
        sequence: list[str] = list(meta.get("_document_sequence", []) if meta else [])
        statuses: dict = dict(meta.get("_document_statuses", {}) if meta else {})

        doc_files = sorted(coll_dir.glob("*.json"))
        print(f"\n  [{coll_name}]  {len(doc_files)} document(s)")

        for doc_file in doc_files:
            doc_id = doc_file.stem
            doc_data = json.loads(doc_file.read_text())
            doc_meta = doc_data.pop(_META_KEY, None)
            doc_data.pop("_id", None)
            # New-format files carry status in _meta_data; legacy files still
            # have a flat _status left in doc_data — either way it ends up set.
            if doc_meta is not None:
                doc_data["_status"] = doc_meta.get("status", "draft")
            else:
                doc_data.setdefault("_status", "draft")
            if merge and doc_id in existing_ids:
                existing = (
                    await db.fetch_document(project_id, workspace_name, collection_id, doc_id) or {}
                )
                doc_data = {**existing, **doc_data}
            db.upsert_document(project_id, workspace_name, collection_id, doc_id, doc_data)
            if doc_id in existing_ids:
                print(f"    ~ {doc_id}  (updated)")
            else:
                sequence.append(doc_id)
                statuses.setdefault(doc_id, doc_data.get("_status", "draft"))
                print(f"    + {doc_id}  (created)")

        db.upsert_document(
            project_id,
            workspace_name,
            collection_id,
            "_meta_data",
            {
                "_document_sequence": sequence,
                "_document_statuses": statuses,
            },
        )


def cmd_documents_import(
    project_id: str, workspace_name: str, backup_dir: Path, merge: bool = False
) -> None:
    db = get_data_client()
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found. Run export first.", file=sys.stderr)
        sys.exit(1)
    mode = "merge" if merge else "replace"
    print(f"Importing documents [{workspace_name}] from {docs_dir}/  ({mode} mode)")
    asyncio.run(_import_docs_async(db, project_id, workspace_name, docs_dir, merge=merge))
    print("\nDone.")


# ─── Media (uploaded files) export/import ─────────────────────────────────────
# Uploads are stored flat, with no project association (see routers/media.py) —
# the only way to know which files a project's backup needs is to scan its
# already-exported document JSON for referenced filenames.


def _referenced_media_filenames(docs_dir: Path) -> set[str]:
    filenames: set[str] = set()
    if not docs_dir.exists():
        return filenames
    for doc_file in docs_dir.rglob("*.json"):
        filenames.update(_MEDIA_URL_RE.findall(doc_file.read_text()))
    return filenames


def cmd_media_export(backup_dir: Path) -> None:
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found. Run 'export documents' first.", file=sys.stderr)
        sys.exit(1)

    filenames = _referenced_media_filenames(docs_dir)
    media_dir = backup_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    print(f"Backing up {len(filenames)} referenced file(s) from {_UPLOAD_DIR} → {media_dir}/")
    missing = 0
    for filename in sorted(filenames):
        src = _UPLOAD_DIR / filename
        if not src.exists():
            print(f"  ✗ {filename}  (not found in {_UPLOAD_DIR})", file=sys.stderr)
            missing += 1
            continue
        shutil.copy2(src, media_dir / filename)
        print(f"  ✓ {filename}")
    print(f"Done.{f'  {missing} file(s) missing.' if missing else ''}")


def cmd_media_import(backup_dir: Path) -> None:
    media_dir = backup_dir / "media"
    if not media_dir.exists():
        print(f"Error: {media_dir} not found. Run 'export media' first.", file=sys.stderr)
        sys.exit(1)

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in media_dir.iterdir() if p.is_file())
    print(f"Restoring {len(files)} file(s) → {_UPLOAD_DIR}/")
    for f in files:
        shutil.copy2(f, _UPLOAD_DIR / f.name)
        print(f"  ✓ {f.name}")
    print("Done.")


def _put_file(url: str, filepath: Path) -> dict:
    """Multipart PUT of a single file — urllib has no multipart helper, so this
    builds the body by hand rather than pulling in a dependency for one call."""
    boundary = uuid.uuid4().hex
    content_type = mimetypes.guess_type(filepath.name)[0] or "application/octet-stream"
    body = (
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filepath.name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
        + filepath.read_bytes()
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} PUT {url}: {e.read().decode(errors='replace')}") from e


def cmd_media_export_http(base_url: str, backup_dir: Path) -> None:
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found. Run 'export documents' first.", file=sys.stderr)
        sys.exit(1)

    filenames = _referenced_media_filenames(docs_dir)
    media_dir = backup_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {len(filenames)} referenced file(s) via {base_url}")
    missing = 0
    for filename in sorted(filenames):
        try:
            with urllib.request.urlopen(f"{base_url}/media/files/{filename}") as resp:
                (media_dir / filename).write_bytes(resp.read())
            print(f"  ✓ {filename}")
        except urllib.error.HTTPError as e:
            print(f"  ✗ {filename}: HTTP {e.code}", file=sys.stderr)
            missing += 1
    print(f"Done.{f'  {missing} file(s) missing.' if missing else ''}")


def cmd_media_import_http(base_url: str, backup_dir: Path) -> None:
    media_dir = backup_dir / "media"
    if not media_dir.exists():
        print(f"Error: {media_dir} not found. Run 'export media' first.", file=sys.stderr)
        sys.exit(1)

    files = sorted(p for p in media_dir.iterdir() if p.is_file())
    print(f"Restoring {len(files)} file(s) via {base_url}")
    for f in files:
        try:
            _put_file(f"{base_url}/media/files/{f.name}", f)
            print(f"  ✓ {f.name}")
        except RuntimeError as e:
            print(f"  ✗ {f.name}: {e}", file=sys.stderr)
    print("Done.")


# ─── Entry point ───────────────────────────────────────────────────────────────

_DEFAULT_BACKUP_DIR = _BACKEND_DIR.parent / "backup"


def _add_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--project-id", required=True, help="Project ID")
    p.add_argument(
        "--backup-dir", default=None, help=f"Backup root directory (default: {_DEFAULT_BACKUP_DIR})"
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="API base URL — if set, uses HTTP instead of direct DB access",
    )


def _add_doc_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--project-id", required=True, help="Project ID")
    p.add_argument("--workspace", default="production", help="Workspace name (default: production)")
    p.add_argument(
        "--backup-dir", default=None, help=f"Backup root directory (default: {_DEFAULT_BACKUP_DIR})"
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="API base URL — if set, uses HTTP instead of direct DB access",
    )
    p.add_argument(
        "--merge",
        action="store_true",
        default=False,
        help="Merge backup into existing document instead of replacing (DB mode only)",
    )


def _add_media_args(p: argparse.ArgumentParser) -> None:
    # No --project-id: media backup just scans whatever <backup-dir>/documents/
    # a prior 'documents export' already produced, so it's inherently scoped
    # to that backup dir, not a project.
    p.add_argument(
        "--backup-dir", default=None, help=f"Backup root directory (default: {_DEFAULT_BACKUP_DIR})"
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="API base URL — if set, uses HTTP instead of direct filesystem access",
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="dashtro", description="DashTro CMS CLI.")
    verbs = parser.add_subparsers(dest="verb", required=True)

    export_parser = verbs.add_parser("export", help="Export schema/documents/media → <backup-dir>/")
    export_sub = export_parser.add_subparsers(dest="noun", required=True)
    _add_args(export_sub.add_parser("schema", help="Export schemas + collections → <backup-dir>/"))
    _add_doc_args(
        export_sub.add_parser("documents", help="Export documents → <backup-dir>/documents/")
    )
    _add_media_args(
        export_sub.add_parser(
            "media",
            help="Copy referenced upload files → <backup-dir>/media/ (run after 'export documents')",
        )
    )

    import_parser = verbs.add_parser(
        "import", help="Import schema/documents/media from <backup-dir>/"
    )
    import_sub = import_parser.add_subparsers(dest="noun", required=True)
    _add_args(
        import_sub.add_parser("schema", help="Import schemas + collections from <backup-dir>/")
    )
    _add_doc_args(
        import_sub.add_parser("documents", help="Import documents from <backup-dir>/documents/")
    )
    _add_media_args(
        import_sub.add_parser("media", help="Restore upload files from <backup-dir>/media/")
    )

    args = parser.parse_args()
    backup_dir = Path(args.backup_dir).resolve() if args.backup_dir else _DEFAULT_BACKUP_DIR
    base_url = args.base_url.rstrip("/") if args.base_url else None

    # chdir is only needed for direct DB mode (decouple needs .env, SQLite needs relative path)
    if not base_url:
        os.chdir(_BACKEND_DIR)

    try:
        if args.verb == "export":
            if args.noun == "schema":
                if base_url:
                    cmd_export_http(base_url, args.project_id, backup_dir)
                else:
                    cmd_export(args.project_id, backup_dir)
            elif args.noun == "documents":
                if base_url:
                    cmd_documents_export_http(base_url, args.project_id, args.workspace, backup_dir)
                else:
                    cmd_documents_export(args.project_id, args.workspace, backup_dir)
            elif args.noun == "media":
                if base_url:
                    cmd_media_export_http(base_url, backup_dir)
                else:
                    cmd_media_export(backup_dir)
        elif args.verb == "import":
            if args.noun == "schema":
                if base_url:
                    cmd_import_http(base_url, args.project_id, backup_dir)
                else:
                    cmd_import(args.project_id, backup_dir)
            elif args.noun == "documents":
                if base_url:
                    cmd_documents_import_http(
                        base_url, args.project_id, args.workspace, backup_dir, merge=args.merge
                    )
                else:
                    cmd_documents_import(
                        args.project_id, args.workspace, backup_dir, merge=args.merge
                    )
            elif args.noun == "media":
                if base_url:
                    cmd_media_import_http(base_url, backup_dir)
                else:
                    cmd_media_import(backup_dir)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
