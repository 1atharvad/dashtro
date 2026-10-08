# Changesets

Run `npm run changeset` after any change to the app itself (`cms_backend/`,
`cms-frontend/`, `cms_mcp/`, `emails/`, `Dockerfile.dashtro`) and follow the
prompts. That writes a markdown file under this folder describing the change
(patch = fix/chore, minor = feature) — commit it alongside your code.

On push to `main`, CI (`.github/workflows/build-image.yml`, `app-version`
job) finds pending changesets, bumps the root `package.json`, mirrors that
version into `pyproject.toml` (the `dashtro` PyPI package), prepends the
entries to `CHANGELOG.md`, builds the Docker image with that version baked
in (shown in Settings), and publishes to PyPI.

The SDK packages (`sdk/js`, `sdk/mcp`) keep their own changesets under their
own `.changeset/` folders.
