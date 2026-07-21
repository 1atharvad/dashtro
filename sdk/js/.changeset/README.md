# Changesets

Run `npm run changeset` after a change that should ship a new `@dashtro/client`
version, and follow the prompts. That writes a markdown file under this
folder describing the change — commit it alongside your code.

On merge to `main`, CI (`.github/workflows/sdk-release.yml`) finds any
pending changesets, bumps the version, updates `CHANGELOG.md`, publishes to
npm, and mirrors the same version into `sdk/python/pyproject.toml` for PyPI.

See https://github.com/changesets/changesets for the full docs.
