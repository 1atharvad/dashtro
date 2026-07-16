# Dashtro Backend

FastAPI backend for Dashtro — auth, schema engine, and CRUD for
projects/workspaces/collections/documents, plus a promote-to-production
pipeline and audit logging.

## Structure

- `main.py` — app setup, router wiring, static SPA mount (`/assets` + catch-all
  fallback) for the combined-image prod build.
- `routers/` — one module per resource: `auth`, `projects`, `schema`,
  `schema_categories`, `collections`, `documents`, `media`, `audit`,
  `field_types`, `rich_text_components`, `realtime_db` (mounted under
  `/api/cms`), plus `sdk_documents`/`sdk_realtime_db` (mounted under `/api/sdk`
  for the client SDK).
- `models/` — Pydantic request/response models.
- `api/utils/` — data layer: `sqlite_client.py` / `postgres_client.py` implement
  the same `Auth`/`Data` interface, selected at runtime by `DB_TYPE` via
  `get_data_client()` / `get_auth_client()` / `get_audit_client()` in
  `api/utils/__init__.py`. Also: `schema.py` (schema validation), `actor.py`
  (auth/actor resolution), `workspace_diff.py` (workspace diffing for
  push/pull-to-production).
- `scripts/cms_schema.py` — export/import CLI for schemas, documents, and
  media (installed as the `dashtro` console script; see root
  [README](../README.md#backup--restore-cli)).
- `tests/` — pytest suite; `conftest.py` resets the singleton DB client per
  test and supports `TEST_DB_TYPE=postgres` to run the same suite against a
  real Postgres instance.

## Running

Via the root compose files (recommended — see root [README](../README.md)),
or directly:

```bash
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in real values
uvicorn main:app --reload
```

## Data backend

`DB_TYPE` (from `.env`) selects `sqlite` (default) or `postgres`. Both clients
implement identical method signatures so routers are backend-agnostic — see
`api/utils/sqlite_client.py` and `api/utils/postgres_client.py`.

## Tests

```bash
pytest                          # SQLite (default, isolated tmp file per test)
TEST_DB_TYPE=postgres pytest    # Postgres (needs DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD reachable)
```
