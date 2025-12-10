#!/usr/bin/env python3
"""
DashTro schema CLI — export and import schemas + collections directly via the DB.

Usage
-----
    dashtro schema export --project-id <id> [--backup-dir ./backup]
    dashtro schema import --project-id <id> [--backup-dir ./backup]

Backup layout
-------------
    backup/
      schemas/
        BlogPost.json
        Author.json
      collections.json

Each schema file:
    {
      "_folder": "Blog",
      "fields": [{ "_name": "title", "_type": "String", "_index": 1, ... }]
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
import os
import sys
import uuid
from pathlib import Path

# ── Make backend importable regardless of where the CLI is invoked from ────────
_BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from api.utils import get_data_client                           # noqa: E402
from api.utils.schema import schema_jsonify, get_schema_names  # noqa: E402
from models.schema import SchemaFieldIn                        # noqa: E402
from models.collection import SchemaCollectionIn               # noqa: E402

_SKIP_EXPORT = {"_id", "_schema_name"}
_PRESERVE_IMPORT = {"_nested_schema", "_reference_schema"}



# ─── HTTP helpers (used when --base-url is provided) ──────────────────────────

import urllib.request
import urllib.error

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
    categories = db.get_categories(project_id)          # {cat_id: {name: ...}}
    category_map = db.get_category_map(project_id)      # {schema_name: cat_id}

    print(f"Exporting {len(schema_names)} schema(s) → {schemas_dir}/")
    for name in schema_names:
        result = schema_jsonify(schema, allowed_schema_name=name, sort_indices=True)
        raw_fields = result.get(name, [])
        fields = [{k: v for k, v in f.items() if k not in _SKIP_EXPORT} for f in raw_fields]

        cat_id = category_map.get(name, "")
        folder = categories[cat_id]["name"] if cat_id and cat_id in categories else ""

        out_path = schemas_dir / f"{name}.json"
        out_path.write_text(json.dumps({"_folder": folder, "fields": fields}, indent=2))
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
            folder_name = data.get("_folder", "")

        # Deduplicate by _name — keep first occurrence, warn on extras
        seen: set[str] = set()
        deduped = []
        for f in fields_from_file:
            n = f.get("_name")
            if n in seen:
                print(f"    ⚠ Duplicate field '{n}' in file — keeping first occurrence", file=sys.stderr)
            else:
                seen.add(n)
                deduped.append(f)
        fields_from_file = deduped

        print(f"\n  [{schema_name}]  {len(fields_from_file)} field(s)")

        # Build live field map: _name → {_id, ...all stored fields}
        live_schema = db.get_schema(project_id)
        live_result = schema_jsonify(live_schema, allowed_schema_name=schema_name, sort_indices=True)
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
            db.upsert_document(project_id, "production", collection_id, "_meta_data", {"_document_sequence": []})
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
        (schemas_dir / f"{name}.json").write_text(json.dumps({"_folder": folder, "fields": fields}, indent=2))
        print(f"  ✓ {name}" + (f"  (folder: {folder})" if folder else ""))
    # collections
    cols = _get(base_url, f"/projects/{project_id}/collections/")
    exportable = [{"_collection_name": c["_collection_name"], "_schema_name": c["_schema_name"]}
                  for c in cols.get("_schema_collections", [])]
    (backup_dir / "collections.json").write_text(json.dumps(exportable, indent=2))
    print(f"\nExported {len(exportable)} collection(s) → collections.json")
    print("Done.")


def cmd_import_http(base_url: str, project_id: str, backup_dir: Path) -> None:
    schemas_dir = backup_dir / "schemas"
    if not schemas_dir.exists():
        print(f"Error: {schemas_dir} not found.", file=sys.stderr); sys.exit(1)
    files = sorted(schemas_dir.glob("*.json"))
    cat_data = _get(base_url, f"/projects/{project_id}/schema-categories/")
    live_cats: list[dict] = cat_data.get("categories", [])
    cat_map: dict = cat_data.get("category_map", {})

    def ensure_cat(name: str) -> str:
        for c in live_cats:
            if c["name"] == name: return c["id"]
        new_cat = _post(base_url, f"/projects/{project_id}/schema-categories/", {"name": name})
        live_cats.append(new_cat); return new_cat["id"]

    print(f"Importing {len(files)} schema file(s) via {base_url}")
    for file in files:
        schema_name = file.stem
        data = json.loads(file.read_text())
        fields_from_file = data if isinstance(data, list) else data.get("fields", [])
        folder_name = "" if isinstance(data, list) else data.get("_folder", "")
        seen: set[str] = set(); deduped = []
        for f in fields_from_file:
            n = f.get("_name")
            if n not in seen: seen.add(n); deduped.append(f)
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
            if not fn: continue
            file_names.add(fn)
            if fn in live_by_name:
                fid = live_by_name[fn]["_id"]
                payload = {k: v for k, v in field.items() if k not in _PRESERVE_IMPORT}
                try: _put(base_url, f"/projects/{project_id}/schema/{fid}/", payload); print(f"    ~ {fn}")
                except RuntimeError as e: print(f"    ✗ {fn}: {e}", file=sys.stderr)
            else:
                try: _post(base_url, f"/projects/{project_id}/schema/", {**field, "_schema_name": schema_name}); print(f"    + {fn}")
                except RuntimeError as e: print(f"    ✗ {fn}: {e}", file=sys.stderr)
        for fn, lf in live_by_name.items():
            if fn not in file_names:
                try: _request("DELETE", f"{base_url}/projects/{project_id}/schema/{lf['_id']}/"); print(f"    - {fn}")
                except RuntimeError as e: print(f"    ✗ delete {fn}: {e}", file=sys.stderr)
        if folder_name:
            cat_id = ensure_cat(folder_name)
            if cat_map.get(schema_name) != cat_id:
                _put(base_url, f"/projects/{project_id}/schema-category-map/{schema_name}/", {"category_id": cat_id})
                cat_map[schema_name] = cat_id; print(f"    → folder: {folder_name}")
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
                _put(base_url, f"/projects/{project_id}/collections/{live_cols[name]['_id']}/",
                     {"_collection_name": name, "_schema_name": sname, "_index": live_cols[name].get("_index", i)})
                print(f"  ~ {name} → {sname}")
            else:
                _post(base_url, f"/projects/{project_id}/collections/",
                      {"_collection_name": name, "_schema_name": sname, "_index": i})
                print(f"  + {name} → {sname}")
    print("\nDone.")


# ─── HTTP-based document export/import ────────────────────────────────────────

def cmd_documents_export_http(base_url: str, project_id: str, workspace_name: str, backup_dir: Path) -> None:
    docs_dir = backup_dir / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    cols = _get(base_url, f"/projects/{project_id}/collections/")
    print(f"Exporting documents [{workspace_name}] via {base_url}")
    for col in cols.get("_schema_collections", []):
        coll_name = col["_collection_name"]
        meta = _get(base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/")
        doc_ids = [d for d in meta.get("_document_ids", []) if d]
        if not doc_ids: print(f"  - {coll_name}  (no documents)"); continue
        coll_dir = docs_dir / coll_name; coll_dir.mkdir(exist_ok=True)
        for doc_id in doc_ids:
            doc = _get(base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/document/{doc_id}/")
            doc.pop("_id", None)
            (coll_dir / f"{doc_id}.json").write_text(json.dumps(doc, indent=2))
        print(f"  ✓ {coll_name}  ({len(doc_ids)} document(s))")
    print("Done.")


def cmd_documents_import_http(base_url: str, project_id: str, workspace_name: str, backup_dir: Path, merge: bool = False) -> None:
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found.", file=sys.stderr); sys.exit(1)
    mode = "merge" if merge else "replace"
    print(f"Importing documents [{workspace_name}] via {base_url}  ({mode} mode)")
    for coll_dir in sorted(p for p in docs_dir.iterdir() if p.is_dir()):
        coll_name = coll_dir.name
        meta = _get(base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/")
        existing_ids = set(meta.get("_document_ids", []))
        doc_files = sorted(coll_dir.glob("*.json"))
        print(f"\n  [{coll_name}]  {len(doc_files)} document(s)")
        for doc_file in doc_files:
            doc_id = doc_file.stem
            doc_data = json.loads(doc_file.read_text())
            doc_data.pop("_id", None)
            if doc_id in existing_ids:
                try:
                    # HTTP PUT always merges (backend only updates keys present in body)
                    _put(base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/document/{doc_id}/", doc_data)
                    print(f"    ~ {doc_id}  (updated)")
                except RuntimeError as e: print(f"    ✗ {doc_id}: {e}", file=sys.stderr)
            else:
                try:
                    _post(base_url, f"/projects/{project_id}/workspace/{workspace_name}/collection/{coll_name}/", {"_id": doc_id, **doc_data})
                    print(f"    + {doc_id}  (created)")
                except RuntimeError as e: print(f"    ✗ {doc_id}: {e}", file=sys.stderr)
    print("\nDone.")


# ─── Documents export/import ──────────────────────────────────────────────────

_DOC_SKIP = {'_id'}


async def _export_docs_async(db, project_id: str, workspace_name: str, docs_dir: Path) -> None:
    collections = db.get_collections(project_id)
    if not collections:
        print("  (no collections found)")
        return
    for collection_id, coll_data in collections.items():
        coll_name = coll_data.get('_collection_name', '')
        if not coll_name:
            continue
        meta = await db.fetch_document(project_id, workspace_name, collection_id, '_meta_data')
        doc_ids = [d for d in (meta.get('_document_sequence', []) if meta else []) if d]
        if not doc_ids:
            print(f"  - {coll_name}  (no documents)")
            continue
        coll_dir = docs_dir / coll_name
        coll_dir.mkdir(exist_ok=True)
        for doc_id in doc_ids:
            doc = await db.fetch_document(project_id, workspace_name, collection_id, doc_id)
            if doc:
                clean = {k: v for k, v in doc.items() if k not in _DOC_SKIP}
                (coll_dir / f"{doc_id}.json").write_text(json.dumps(clean, indent=2))
        print(f"  ✓ {coll_name}  ({len(doc_ids)} document(s))")


def cmd_documents_export(project_id: str, workspace_name: str, backup_dir: Path) -> None:
    db = get_data_client()
    docs_dir = backup_dir / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)
    print(f"Exporting documents [{workspace_name}] → {docs_dir}/")
    asyncio.run(_export_docs_async(db, project_id, workspace_name, docs_dir))
    print("Done.")


async def _import_docs_async(db, project_id: str, workspace_name: str, docs_dir: Path, merge: bool = False) -> None:
    collections = db.get_collections(project_id)
    coll_by_name = {v['_collection_name']: k for k, v in collections.items()}

    for coll_dir in sorted(p for p in docs_dir.iterdir() if p.is_dir()):
        coll_name = coll_dir.name
        if coll_name not in coll_by_name:
            print(f"  ✗ '{coll_name}' not found in collections — skipping", file=sys.stderr)
            continue
        collection_id = coll_by_name[coll_name]
        meta = await db.fetch_document(project_id, workspace_name, collection_id, '_meta_data')
        existing_ids: set[str] = set(meta.get('_document_sequence', []) if meta else [])
        sequence: list[str] = list(meta.get('_document_sequence', []) if meta else [])
        statuses: dict = dict(meta.get('_document_statuses', {}) if meta else {})

        doc_files = sorted(coll_dir.glob('*.json'))
        print(f"\n  [{coll_name}]  {len(doc_files)} document(s)")

        for doc_file in doc_files:
            doc_id = doc_file.stem
            doc_data = json.loads(doc_file.read_text())
            doc_data.pop('_id', None)
            if merge and doc_id in existing_ids:
                existing = await db.fetch_document(project_id, workspace_name, collection_id, doc_id) or {}
                doc_data = {**existing, **doc_data}
            db.upsert_document(project_id, workspace_name, collection_id, doc_id, doc_data)
            if doc_id in existing_ids:
                print(f"    ~ {doc_id}  (updated)")
            else:
                sequence.append(doc_id)
                statuses.setdefault(doc_id, doc_data.get('_status', 'draft'))
                print(f"    + {doc_id}  (created)")

        db.upsert_document(project_id, workspace_name, collection_id, '_meta_data', {
            '_document_sequence': sequence,
            '_document_statuses': statuses,
        })


def cmd_documents_import(project_id: str, workspace_name: str, backup_dir: Path, merge: bool = False) -> None:
    db = get_data_client()
    docs_dir = backup_dir / "documents"
    if not docs_dir.exists():
        print(f"Error: {docs_dir} not found. Run export first.", file=sys.stderr)
        sys.exit(1)
    mode = "merge" if merge else "replace"
    print(f"Importing documents [{workspace_name}] from {docs_dir}/  ({mode} mode)")
    asyncio.run(_import_docs_async(db, project_id, workspace_name, docs_dir, merge=merge))
    print("\nDone.")


# ─── Entry point ───────────────────────────────────────────────────────────────

_DEFAULT_BACKUP_DIR = _BACKEND_DIR.parent / "backup"


def _add_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--project-id", required=True, help="Project ID")
    p.add_argument("--backup-dir", default=None, help=f"Backup root directory (default: {_DEFAULT_BACKUP_DIR})")
    p.add_argument("--base-url", default=None, help="API base URL — if set, uses HTTP instead of direct DB access")


def _add_doc_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--project-id", required=True, help="Project ID")
    p.add_argument("--workspace", default="production", help="Workspace name (default: production)")
    p.add_argument("--backup-dir", default=None, help=f"Backup root directory (default: {_DEFAULT_BACKUP_DIR})")
    p.add_argument("--base-url", default=None, help="API base URL — if set, uses HTTP instead of direct DB access")
    p.add_argument("--merge", action="store_true", default=False, help="Merge backup into existing document instead of replacing (DB mode only)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="dashtro", description="DashTro CMS CLI.")
    groups = parser.add_subparsers(dest="group", required=True)

    schema_parser = groups.add_parser("schema", help="Schema and collection operations")
    schema_sub = schema_parser.add_subparsers(dest="command", required=True)
    _add_args(schema_sub.add_parser("export", help="Export schemas + collections → <backup-dir>/"))
    _add_args(schema_sub.add_parser("import", help="Import schemas + collections from <backup-dir>/"))

    docs_parser = groups.add_parser("documents", help="Document content operations")
    docs_sub = docs_parser.add_subparsers(dest="command", required=True)
    _add_doc_args(docs_sub.add_parser("export", help="Export documents → <backup-dir>/documents/"))
    _add_doc_args(docs_sub.add_parser("import", help="Import documents from <backup-dir>/documents/"))

    args = parser.parse_args()
    backup_dir = Path(args.backup_dir).resolve() if args.backup_dir else _DEFAULT_BACKUP_DIR
    base_url = args.base_url.rstrip("/") if args.base_url else None

    # chdir is only needed for direct DB mode (decouple needs .env, SQLite needs relative path)
    if not base_url:
        os.chdir(_BACKEND_DIR)

    try:
        if args.group == "schema":
            if args.command == "export":
                if base_url: cmd_export_http(base_url, args.project_id, backup_dir)
                else: cmd_export(args.project_id, backup_dir)
            elif args.command == "import":
                if base_url: cmd_import_http(base_url, args.project_id, backup_dir)
                else: cmd_import(args.project_id, backup_dir)
        elif args.group == "documents":
            if args.command == "export":
                if base_url: cmd_documents_export_http(base_url, args.project_id, args.workspace, backup_dir)
                else: cmd_documents_export(args.project_id, args.workspace, backup_dir)
            elif args.command == "import":
                if base_url: cmd_documents_import_http(base_url, args.project_id, args.workspace, backup_dir, merge=args.merge)
                else: cmd_documents_import(args.project_id, args.workspace, backup_dir, merge=args.merge)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
