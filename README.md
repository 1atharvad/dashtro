# Dashtro

A self-hosted CMS with a project → workspace → collection → document model,
a FastAPI backend, and a React/TypeScript frontend. Ships as a single Docker
image in production (FastAPI serves both the API and the built SPA), or as
separate dev containers for hot-reloading.

## Structure

- [`cms_backend/`](cms_backend/) — FastAPI backend (API, auth, schema engine, data clients). See its [README](cms_backend/README.md).
- [`cms-frontend/`](cms-frontend/) — React + TypeScript + Vite frontend. See its [README](cms-frontend/README.md).
- [`cms_mcp/`](cms_mcp/) — MCP server exposing Dashtro operations to MCP-compatible clients.
- [`sdk/`](sdk/) — client SDK for the `/api/sdk/*` endpoints.
- [`nginx/`](nginx/) — reverse proxy configs for dev and prod.

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

## Running in production

Single combined image (`Dockerfile.dashtro`) behind nginx:

```bash
npm run prod:build   # docker compose -f docker-compose.prod.yml build
npm run prod         # docker compose -f docker-compose.prod.yml up -d
npm run prod:logs
npm run prod:down
```

`prod` reuses the existing `dashtro:${IMAGE_TAG:-latest}` image without rebuilding —
run `prod:build` explicitly after code changes, or point `IMAGE_TAG` at an image
pulled from a registry.

## Environment variables

See [`.env.example`](.env.example) for the full list (`DB_TYPE`, `JWT_SECRET_KEY`,
`CORS_ORIGINS`, `CMS_PUBLIC_URL`, etc.). Copy it to `.env` (gitignored) and fill in
real values before running either compose file.

## Backup / restore CLI

`cms_backend/scripts/cms_schema.py` (installed as the `dashtro` console script)
exports/imports schemas, documents, and media to/from a `backup/` directory:

```bash
dashtro export schema --project-id <id>
dashtro export documents --project-id <id> --workspace <name>
dashtro export media
```

Run against the prod container directly:

```bash
docker compose -f docker-compose.prod.yml exec dashtro dashtro export schema --project-id <id> --backup-dir /app/backup
```

## CI/CD

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every
push to `main` (or manually via `workflow_dispatch`):

1. **`lint`** — frontend `npm run lint` + backend `isort`/`black`/`ruff
   --check`. Must pass before anything builds or deploys.
2. **`build-and-push`** — builds `Dockerfile.dashtro`, pushes to
   `ghcr.io/1atharvad/dashtro` tagged `latest` and the commit SHA.
3. **`deploy`** — regenerates `.env` fresh from repo secrets, copies it to the
   server, then SSHes in to `git pull`, `docker compose pull`, and `up -d`.
   No build happens on the server, and `.env` is no longer hand-maintained
   there — it's fully derived from GitHub secrets on every deploy.

Required repo secrets — every var the app reads at runtime (since `deploy`
regenerates `.env` from these), plus deploy-only ones:

| Secret | Purpose |
| --- | --- |
| `JWT_SECRET_KEY`, `DEBUG`, `CORS_ORIGINS`, `CMS_PUBLIC_URL`, `DB_TYPE`, `SQLITE_DB_PATH`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Written into the server's `.env` on every deploy (see [`.env.example`](.env.example)) |
| `DEPLOY_HOST` | Server hostname/IP to SSH into |
| `DEPLOY_USER` | SSH user on that server |
| `DEPLOY_SSH_KEY` | Private key for that user (public key must be in the server's `authorized_keys`) |
| `DEPLOY_PATH` | Absolute path to this repo's checkout on the server |
| `GHCR_PULL_TOKEN` | A GitHub PAT with `read:packages`, used by the server to `docker login ghcr.io` and pull the image (only needed if the package is private) |

Server-side prerequisites: this repo cloned at `DEPLOY_PATH`, and Docker +
the compose plugin installed. `.env` itself no longer needs to be
pre-populated there — the workflow overwrites it every deploy.

## Tests

```bash
cd cms_backend && pytest              # backend, SQLite by default
TEST_DB_TYPE=postgres pytest          # backend, against a reachable Postgres

cd cms-frontend && npm test           # frontend (vitest)
```
