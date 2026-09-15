// Manual fallback for the GitHub Actions release jobs (dashtro-release,
// sdk-release) in .github/workflows/build-image.yml. Use this only when
// GitHub Actions is unavailable — it publishes with real PyPI/npm tokens
// instead of OIDC trusted publishing, since OIDC only works inside a real
// Actions run.
//
// Requires, in the environment:
//   TWINE_USERNAME / TWINE_PASSWORD (or a configured ~/.pypirc) for PyPI
//   `npm whoami` returning a logged-in user (npm login) for npm
//
// Usage: node scripts/manual-release.mjs dashtro|sdk|mcp|all
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { hasPendingChangeset } from "./lib/changesets.mjs";

/** Runs `cmd` synchronously, streaming output, optionally in `cwd`. */
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

/** Reads the `version` field out of `dir/package.json`. */
const pkgVersion = (dir) =>
  JSON.parse(readFileSync(`${dir}/package.json`, "utf8")).version;

/** Builds the root `dashtro` package and publishes it to PyPI via twine. */
const releaseDashtro = () => {
  console.log("==> Building and publishing dashtro (root package) to PyPI");
  rmSync("dist", { recursive: true, force: true });
  run("python -m pip install --quiet build twine");
  run("python -m build");
  run("twine upload --skip-existing dist/*");
};

/**
 * Versions sdk/js from its pending changeset, syncs that version into
 * sdk/python, then publishes @dashtro/client to npm and dashtro-client to
 * PyPI. No-op if sdk/js has no pending changeset.
 */
const releaseSdk = () => {
  if (!hasPendingChangeset("sdk/js")) {
    console.log("==> No pending sdk/js changeset — skipping sdk release");
    return;
  }

  console.log("==> Versioning sdk/js from changesets");
  run("npm ci", "sdk/js");
  run("npm run version-packages", "sdk/js");
  run("node sdk/scripts/sync-python-version.mjs");

  console.log("==> Publishing @dashtro/client to npm");
  run("npm run release", "sdk/js");

  console.log("==> Publishing dashtro-client to PyPI");
  rmSync("sdk/python/dist", { recursive: true, force: true });
  run("python -m pip install --quiet build twine", "sdk/python");
  run("python -m build", "sdk/python");
  run("twine upload --skip-existing dist/*", "sdk/python");

  console.log(
    `\n!! Version bump was NOT committed or pushed — review and commit\n` +
      `!! sdk/js and sdk/python by hand:\n` +
      `     git add sdk/js sdk/python && git commit -m "sdk v${pkgVersion("sdk/js")}"`,
  );
};

/**
 * Versions sdk/mcp from its pending changeset and publishes @dashtro/mcp
 * to npm. No-op if sdk/mcp has no pending changeset.
 */
const releaseMcp = () => {
  if (!hasPendingChangeset("sdk/mcp")) {
    console.log("==> No pending sdk/mcp changeset — skipping mcp release");
    return;
  }

  console.log("==> Versioning sdk/mcp from changesets");
  run("npm ci", "sdk/mcp");
  run("npm run version-packages", "sdk/mcp");

  console.log("==> Publishing @dashtro/mcp to npm");
  run("npm run release", "sdk/mcp");

  console.log(
    `\n!! Version bump was NOT committed or pushed — review and commit\n` +
      `!! sdk/mcp by hand:\n` +
      `     git add sdk/mcp && git commit -m "@dashtro/mcp v${pkgVersion("sdk/mcp")}"`,
  );
};

const target = process.argv[2];
const targets = { dashtro: releaseDashtro, sdk: releaseSdk, mcp: releaseMcp };

if (target === "all") {
  releaseDashtro();
  releaseSdk();
  releaseMcp();
} else if (targets[target]) {
  targets[target]();
} else {
  console.error("Usage: node scripts/manual-release.mjs dashtro|sdk|mcp|all");
  process.exit(1);
}
