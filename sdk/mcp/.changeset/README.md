# Changesets

Run `npm run changeset` after a change that should ship a new `@dashtro/mcp`
version, and follow the prompts. That writes a markdown file under this
folder describing the change — commit it alongside your code.

`@dashtro/mcp` releases independently of `@dashtro/client` (sdk/js) — it
isn't wired into the existing sdk-release workflow yet. See the repo's
`.github/workflows/` for how sdk/js publishes and mirror that setup here
when this package is ready to ship.

See https://github.com/changesets/changesets for the full docs.
