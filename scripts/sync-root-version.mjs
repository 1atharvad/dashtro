// Run after `changeset version` bumps the root package.json. Mirrors that
// version into pyproject.toml so the `dashtro` PyPI package, the Docker image
// and the Settings sidebar all report the same number.
import { readFileSync, writeFileSync } from "node:fs";

/** Rewrites the `version = "..."` line inside pyproject.toml's [project] table to `version`. */
const syncPyproject = (version) => {
  const path = "pyproject.toml";
  const current = readFileSync(path, "utf8");
  const projectVersion = /(^\[project\]\r?\n(?:(?!\[)[^\n]*\n)*?)version = "[^"]+"/m;
  if (!projectVersion.test(current)) {
    throw new Error(`Could not find a version = "..." line in [project] of ${path}`);
  }
  writeFileSync(path, current.replace(projectVersion, `$1version = "${version}"`));
};

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
syncPyproject(version);
console.log(`Synced pyproject.toml to v${version}`);
