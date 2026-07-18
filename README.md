# Dashtro

A self-hosted CMS with a project → workspace → collection → document model,
a FastAPI backend, and a React/TypeScript frontend. Ships as a single Docker
image (`Dockerfile.dashtro`, FastAPI serving both the API and the built SPA),
published to `ghcr.io/1atharvad/dashtro`. This repo only builds and publishes
that image — running it in production (nginx, tunnel/domain routing, etc.) is
owned by the consuming project (e.g. the portfolio site that embeds Dashtro
as its admin/CMS backend).

## Structure

- [`cms_backend/`](cms_backend/) — FastAPI backend (API, auth, schema engine, data clients). See its [README](cms_backend/README.md).
- [`cms-frontend/`](cms-frontend/) — React + TypeScript + Vite frontend. See its [README](cms-frontend/README.md).
- [`cms_mcp/`](cms_mcp/) — MCP server exposing Dashtro operations to MCP-compatible clients.
- [`sdk/`](sdk/) — client SDK for the `/api/sdk/*` endpoints.
- [`nginx/`](nginx/) — reverse proxy config for local dev only.

## Data backends

`DB_TYPE` selects the storage backend, defaulting to `sqlite`:

- `sqlite` — single-file DB, zero external dependencies. Default.
- `postgres` — set `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`. An optional
  bundled `postgres` compose service is available (see below) if you don't want to
  point at an external instance.

Both backends implement the same interface (`get_data_client()` / `get_auth_client()` /
`get_audit_client()` in `cms_backend/api/utils/__init__.py`), so routers don't change
depending on which one is active.

## Running locally (dev)

Hot-reloading, separate frontend/backend containers, Cloudflare tunnel support:

```bash
cp .env.example .env   # fill in real values
npm run dev             # docker compose -f docker-compose.dev.yml up --build
npm run dev:down
```

Optional local Postgres instead of an external one:

```bash
docker compose -f docker-compose.dev.yml --profile postgres up
```

## Running the image elsewhere

The published image serves both the API and the built SPA on port 7312, and
reads its config from env vars (see below) — no other dependency beyond
whichever `DB_TYPE` backend you point it at:

```yaml
dashtro:
  image: ghcr.io/1atharvad/dashtro:latest
  environment:
    JWT_SECRET_KEY: ...
    CORS_ORIGINS: ...
    CMS_PUBLIC_URL: ...
    DB_TYPE: sqlite
    # ...see .env.example for the full list
  volumes:
    - uploads_data:/app/uploads
```

Put it behind whatever reverse proxy/tunnel the consuming project already
uses to route a subdomain (e.g. `admin.example.com`) to it.

## Environment variables

See [`.env.example`](.env.example) for the full list (`DB_TYPE`, `JWT_SECRET_KEY`,
`CORS_ORIGINS`, `CMS_PUBLIC_URL`, etc.).

## Backup / restore CLI

`cms_backend/scripts/cms_schema.py` (installed as the `dashtro` console script)
exports/imports schemas, documents, and media to/from a `backup/` directory:

```bash
dashtro export schema --project-id <id>
dashtro export documents --project-id <id> --workspace <name>
dashtro export media
```

Run against the running container directly:

```bash
docker exec <container> dashtro export schema --project-id <id> --backup-dir /app/backup
```

## CI/CD

[`.github/workflows/build-image.yml`](.github/workflows/build-image.yml) runs
on every push to `main` (or manually via `workflow_dispatch`):

1. **`lint`** — frontend `npm run lint` + backend `isort`/`black`/`ruff
   --check`. Must pass before anything builds.
2. **`build-and-push`** — builds `Dockerfile.dashtro`, pushes to
   `ghcr.io/1atharvad/dashtro` tagged `latest` and the commit SHA.

That's it — this repo doesn't deploy anywhere itself. Whatever consumes the
image (e.g. the portfolio project) is responsible for pulling and running it.

## Tests

```bash
cd cms_backend && pytest              # backend, SQLite by default
TEST_DB_TYPE=postgres pytest          # backend, against a reachable Postgres

cd cms-frontend && npm test           # frontend (vitest)
```
