# Changesets

Run `npm run changeset` after a change that should ship a new `@dashtro/mcp`
version, and follow the prompts. That writes a markdown file under this
folder describing the change — commit it alongside your code.

On merge to `main`, CI (`.github/workflows/build-image.yml`, `sdk-release`
job) finds any pending changesets here (independently of `@dashtro/client`'s),
bumps the version, updates `CHANGELOG.md`, and publishes to npm via OIDC
trusted publishing — same mechanism as `sdk/js`, just a separate check/publish
step since there's no JS↔Python version sync involved.

See https://github.com/changesets/changesets for the full docs.
