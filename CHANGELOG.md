# Changelog

All notable changes to **Dashtro** are documented here. Versions follow
[Semantic Versioning](https://semver.org/): minor for new features, patch for
fixes/chores/docs — pre-1.0, so breaking changes may still land as minor.

---

## [0.23.1] — 2026-07-21

- Fixes `sdk/js/package-lock.json` inconsistency that broke `npm ci` in the
  new `sdk-release` CI job (`Missing: undici-types@8.3.0 from lock file`).
  A single `npm install` left nested `@types/node` entries — pulled in
  transitively by `@changesets/cli` via `@inquirer/external-editor` and
  `@manypkg/find-root`, which want different major versions — not fully
  converged; running install twice stabilizes it.

---

## [0.23.0] — 2026-07-21

- Sets up publishing for both SDKs: `sdk/js` (`@dashtro/client`) gets
  Changesets (`.changeset/`, `changeset`/`version-packages`/`release`
  scripts) for version bumps and changelog generation; `sdk/scripts/
  sync-python-version.mjs` mirrors each bump into `sdk/python`'s
  `pyproject.toml` and `CHANGELOG.md` so both SDKs stay in lockstep.
- Adds a `sdk-release` job to `build-image.yml`: on a pending changeset, it
  versions, publishes `@dashtro/client` to npm and `dashtro-client` to PyPI
  via OIDC trusted publishing (no stored tokens), and pushes the version
  bump commit back to `main`.
- Adds READMEs for both SDKs (shown on their npm/PyPI package pages) and
  fills in `pyproject.toml`/`package.json` metadata (license, author,
  repository, classifiers) PyPI/npm expect.
- Fixes an `exports` field ordering warning in `sdk/js/package.json`
  (`types` now listed before `import`/`require`).

---

## [0.22.0] — 2026-07-18

- `GET /health` returns `{"status": "ok"}`, unauthenticated (registered before
  `CMSAuthMiddleware`-covered routers and the SPA fallback catch-all so
  nothing shadows it).
- `Dockerfile.dashtro`'s `HEALTHCHECK` polls it via Python's `urllib` (no
  `curl` in `python:3.12-slim`), so orchestrators/compose's
  `depends_on: condition: service_healthy` can rely on container status.

---

## [0.21.2] — 2026-07-18

- Retroactively tags the full commit history (v0.1.0 through v0.21.1) and
  documents it in this file. `package.json`'s `version` now tracks the
  current release going forward.

---

## [0.21.1] — 2026-07-18

- `Dockerfile.dashtro` (the standalone published image, no nginx of its own
  in front) now listens on **7312** instead of the generic 8000. Scoped to
  that file only — the dev `backend` container stays on 8000 internally
  since dev's nginx already exposes 7312 as the only host-facing port.

---

## [0.21.0] — 2026-07-18

- The image was `amd64`-only, so pulling it on an Apple Silicon Mac failed
  with `no matching manifest for linux/arm64/v8`. Adds `setup-qemu-action`
  (needed to cross-build `arm64` on the `amd64` GitHub runner) and
  `platforms: linux/amd64,linux/arm64` to `build-push-action`.

---

## [0.20.0] — 2026-07-18

- Dashtro now only builds and publishes the image
  (`ghcr.io/1atharvad/dashtro`) — running it in production moves to whatever
  project consumes it (e.g. the portfolio site).
- Renames `deploy.yml` → `build-image.yml` and drops the (already-disabled)
  `deploy` job.
- Removes `docker-compose.prod.yml` and `nginx/nginx.prod.conf`.
- Deletes three orphaned files — `cms-frontend/Dockerfile.prod`,
  `cms_backend/Dockerfile.prod`, `cms-frontend/nginx.conf` — leftovers from
  an earlier three-container prod design that predates the single combined
  `Dockerfile.dashtro` image.

---

## [0.19.7] — 2026-07-17

- `build-push-action`'s `cache-to: type=gha` requires the `docker-container`
  buildx driver; without an explicit `setup-buildx-action` step it fell back
  to the plain `docker` driver and failed with "Cache export is not
  supported for the docker driver."

---

## [0.19.6] — 2026-07-17

- Pure formatting/import-order fixes across 8 backend files (isort + black)
  — no behavior change, just what CI's lint job was flagging.

---

## [0.19.5] — 2026-07-17

- Fixes a typo in the GitHub repo/image name (`dashro` → `dashtro`, matching
  the project's actual name everywhere else): GHCR image tag,
  `docker-compose.prod.yml`, the CI workflow, README, and `package.json`'s
  repository URL.
- Adds a root `lint` script running frontend eslint + backend
  isort/black/ruff, matching CI's lint job.

---

## [0.19.4] — 2026-07-17

- `firebase_client.py` turned out to be entirely dead code — nothing
  imported `FirebaseAuth`/`FirebaseData`, and no `requirements.txt`/
  `config.py` referenced `firebase_admin`. Deleted outright; the realtime DB
  and document backends go through the sqlite/postgres/mongodb clients
  instead.

---

## [0.19.3] — 2026-07-17

- A dead debug script (`if __name__ == "__main__":` block) in
  `firebase_client.py` exposed a live Firebase Web API key plus a real
  email/password pair — flagged by GitHub secret scanning after being
  pushed to the now-public repo. Key was rotated immediately; the block was
  removed.
- History was subsequently rewritten (`git filter-branch`) to strip the key
  from every commit back to when it was first introduced, and force-pushed
  — rotation neutralizes the exposure, the rewrite just keeps it out of
  future clones.

---

## [0.19.2] — 2026-07-17

- Comments out the `deploy` job in the CI workflow (server/secrets weren't
  set up yet) while keeping `lint` + `build-and-push` running on every push,
  so images still land in GHCR for manual pulls in the meantime.

---

## [0.19.1] — 2026-07-16

- Adds the root `README.md`, `cms_backend/README.md`, and `PLAN.md` (the
  SDK/API-key security architecture: cloudflared → nginx → frontend/JWT vs
  SDK/API-key routing).

---

## [0.19.0] — 2026-07-14

- `cms_mcp/server.py` wraps the SDK's API-key client in an MCP server, so
  tools like Claude Code/Desktop can query and edit CMS content directly
  over MCP.

---

## [0.18.0] — 2026-07-12

- Adds `sdk/js` and `sdk/python` — scoped API-key clients for reading/
  writing documents and the realtime database from external apps, mirroring
  the backend's `sdk_*` routers.

---

## [0.17.1] — 2026-07-10

- First frontend test coverage: `useProject.test.tsx`, `documentSlice.test.ts`,
  `projectSlice.test.ts`.

---

## [0.17.0] — 2026-07-08

- New `RichTextComponentEditor`/`RichTextComponentsList` pages and a
  `richTextComponentSlice`, plus default/wrapper configs used when
  rendering components inside the rich text field.
- Supporting extractions — `UserContext` value type, color mode context,
  shared constants — pulled into their own modules for fast-refresh-safe
  exports.

---

## [0.16.0] — 2026-07-06

- Adds a tree view (`RtdbTreeNode`) and diagram component (`MermaidDiagram`)
  for browsing/editing the realtime key/value store per workspace, a
  `realtimeDbSlice`/`useRealtimeDb` hook, and a `WorkspaceSyncModal` for
  pushing workspace changes.

---

## [0.15.0] — 2026-07-04

- Frontend counterpart to v0.12.0: updates every hook, redux slice, and
  page/component wiring to match the backend's project/workspace hierarchy
  — 68 files, 7100+ insertions, the largest frontend diff in the project's
  history.
- Also finishes removing the `HamburgerMenu` drawer toggle in favor of the
  current header/nav.

---

## [0.14.1] — 2026-07-02

- First backend tests: `test_api_key_auth.py`, `test_auth_middleware.py`,
  `test_route_separation.py`, and `conftest.py` — verifying CMS routes stay
  JWT-only and SDK routes stay API-key-only.

---

## [0.14.0] — 2026-06-30

- New routers: `realtime_db.py` (CMS-facing) and `sdk_realtime_db.py`/
  `sdk_documents.py` (SDK-facing, API-key authenticated) for a realtime
  key/value store.
- Adds `rich_text_components.py` and the `rich_text_component` model, plus
  `scripts/migrate_image_keys.py` for existing media references.

---

## [0.13.0] — 2026-06-28

- Adds `api_key_auth.py` for scoped SDK access, an `auth_middleware.py` that
  routes JWT vs. API-key requests, a postgres-backed audit client, and
  `workspace_diff.py` for computing per-workspace change sets used by the
  audit log.

---

## [0.12.0] — 2026-06-26

- Backend counterpart to the frontend's v0.7.0/v0.8.0 work: extends the
  collection/schema/project models and the sqlite/postgres/mongodb clients
  to support the project/workspace hierarchy, and updates every router
  (`auth`, `collections`, `documents`, `field_types`, `media`, `projects`,
  `schema`, `schema_categories`) to match — 3700+ lines changed.

---

## [0.11.0] — 2026-06-24

- Splits the single `docker-compose.yml` into `docker-compose.dev.yml`
  (hot-reloading, separate frontend/backend containers, Cloudflare tunnel)
  and `docker-compose.prod.yml` (combined image behind nginx).
- Adds a prod nginx config, per-service `Dockerfile.prod`s, a `cloudflared/`
  tunnel config, and `.github/workflows/deploy.yml` — the project's first
  CI/CD pipeline (lint → build → push → deploy).
- Adds `.env.example` documenting every env var the new setup expects.

---

## [0.10.2] — 2026-06-22

- Large styling pass (1400+ lines) across `DocCollection.scss`,
  `Header.scss`, `Modal.scss`, `Schema.scss`, and the global color/theme
  partials, plus matching updates to `ThemeProvider`/`theme.ts`.

---

## [0.10.1] — 2026-06-20

- Fixes `schemaPresetSlice` to fetch presets scoped to the current project
  instead of globally.

---

## [0.10.0] — 2026-06-19

- Splits the old single `SettingsProfile` component into a full settings
  suite: `SettingsUsers`, `SettingsAPI`, `SettingsSecurity`,
  `SettingsIntegrations`, `SettingsAuditLog`, and `AuditHeatmap` (a
  calendar-style activity visualization), all under a rewritten
  `SettingsPage.tsx`.

---

## [0.9.0] — 2026-06-17

- Adds the field component library: `ColorPickerField`,
  `CompoundField`/`CompoundArrayField`, `FileField`, `ImageField`,
  `LinkField`, `NestedDocumentArrayField`, `ReferenceDocumentField`,
  `RichTextModal`, `SimpleArrayField`, plus `config/fieldRegistry.ts` (maps
  schema field types to their components) and `data/content.ts`.

---

## [0.8.0] — 2026-06-15

- Reworks nearly every existing collection/document/schema component and
  hook (`SchemaComponent`, `SchemaEntry`, `DocumentEntry`, `DocumentList`,
  `CollectionComponent`, `CollectionEntry`, `PageForm`, `PageTabs`,
  `LinkDrawer`, plus their hooks/slices) to be workspace-scoped instead of
  global — the largest UI diff in the project's history up to this point
  (2600+ line changes across 20 files).

---

## [0.7.0] — 2026-06-13

- Introduces the project → workspace hierarchy on the frontend:
  `projectSlice`/`workspaceSlice`/`categorySlice`, matching hooks
  (`useProject`, `useWorkspace`, `useCategory`), `ProjectSwitcher`,
  `ManageFoldersModal`, and the `ProjectsList`/`ProjectPage` pages — the
  data model the rest of the app (collections, documents, schema) later
  gets scoped under.

---

## [0.6.0] — 2026-06-11

- Adds `utils/auth.ts` (JWT storage/refresh), `UserContext`,
  `ProtectedRoute`, `AppHeader`, and `Login`/`Signup` pages — the first
  authenticated-routing layer wrapping `App.tsx`.

---

## [0.5.0] — 2026-06-09

- Wires up Tailwind CSS (`tailwind.config.cjs`, `postcss.config.cjs`) and
  `@dnd-kit` for drag-and-drop, alongside the `advi-ui` component library
  dependency and its ambient type declarations — the tooling foundation the
  field/settings UI in later versions is built on.

---

## [0.4.0] — 2025-12-10

- Removes the Django app (`api/views/`, `api/serializers/`,
  `cms_backend/settings.py`, `urls.py`, `asgi.py`/`wsgi.py`, `manage.py`)
  entirely.
- Introduces the FastAPI app structure the rest of the project builds on:
  `main.py`, `config.py`, `models/` (`collection.py`, `field_types.py`,
  `project.py`, `schema.py`), `routers/` (`audit`, `auth`, `collections`,
  `documents`, `field_types`, `media`, `projects`, `schema`,
  `schema_categories`), and `api/utils/` data clients (`sqlite_client.py`
  grows from a stub to ~760 lines, plus `postgres_client.py`,
  `mongodb_client.py`, `audit_client.py`, `actor.py`).
- Adds `cms_backend/scripts/cms_schema.py`, the backup/restore CLI (later
  exposed as the `dashtro` console script).
- Adds `nginx/nginx.conf` and reworks `docker-compose.yml`/`pyproject.toml`
  for the new backend.

---

## [0.3.1] — 2025-08-20

- Three-line `.gitignore` addition (egg-info, runtime sqlite db, document
  backups) — no functional change.

---

## [0.3.0] — 2025-08-15

- Adds Redux state (`collectionSlice`, `documentSlice`, `schemaSlice`,
  `schemaPresetSlice`, `rootPathSlice`) and the hooks that wrap them
  (`useCollection`, `useDocument`, `useSchema`, `useSchemaMetaData`).
- First real UI: `SchemaComponent`/`SchemaEntry`,
  `CollectionComponent`/`CollectionEntry`, `DocumentEntry`/`DocumentList`,
  `PageForm`, `Header`/`HamburgerMenu`/`LinkDrawer`, `Login`,
  `SettingsPage` — plus matching SCSS and a `ThemeProvider`.
- Adds `cms-frontend/Dockerfile` (Vite dev server) and root `.dockerignore`,
  laying groundwork for the eventual docker-compose dev setup.
- Despite the commit title, this version is frontend-only — the "multi-DB
  backend support" half arrives once the backend exists beyond its Django
  skeleton (see v0.4.0 onward).

---

## [0.2.0] — 2025-07-10

- Bootstraps `cms_backend/` as a Django project (`manage.py`,
  `cms_backend/settings.py`, `urls.py`, `asgi.py`/`wsgi.py`) with a single
  `api` app (`admin.py`, `apps.py`, `models.py`, `views.py`, migrations
  folder) — default Django scaffolding, no CMS-specific logic yet.

---

## [0.1.1] — 2025-07-04

- Small cleanup pass on the fresh scaffold: trims the default Vite
  favicon/asset and adjusts `App.tsx`/`main.tsx` structure.

---

## [0.1.0] — 2025-07-03

- Initial `cms-frontend/` scaffold generated via Vite's React + TypeScript
  template: `App.tsx`, `main.tsx`, ESLint config, `tsconfig.*.json`, and
  placeholder `App.scss`/`index.scss`.
- Establishes the frontend as its own npm project (`package.json` +
  `package-lock.json`), separate from the backend that arrives in v0.2.0.

---
