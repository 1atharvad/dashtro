import { execSync } from "node:child_process";
import { hasPendingChangeset } from "./lib/changesets.mjs";

const packages = ["sdk/js", "sdk/mcp"];

/** Root-package paths whose changes must be documented by a root changeset. */
const appPaths = ["cms_backend/", "cms-frontend/", "cms_mcp/", "emails/", "Dockerfile.dashtro"];

/** True for test files, which don't ship and so don't need a changeset. */
const isTestFile = (f) => /(^|\/)(tests?|__tests__)\/|\.test\.[jt]sx?$/.test(f);

/** Paths changed relative to HEAD, per `git diff --name-only`. */
const changedFiles = () =>
  execSync("git diff --name-only HEAD", { encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);

const changed = changedFiles();
const missing = packages.filter(
  (dir) => changed.some((f) => f.startsWith(`${dir}/`)) && !hasPendingChangeset(dir),
);

if (
  changed.some((f) => !isTestFile(f) && appPaths.some((p) => f.startsWith(p))) &&
  !hasPendingChangeset(".")
) {
  missing.push(".");
}

if (missing.length > 0) {
  console.error(`Missing changeset for: ${missing.map((d) => (d === "." ? "app (root)" : d)).join(", ")}`);
  console.error('Run: "npm run changeset" for the app, or npm --prefix <package> run changeset for sdk/js, sdk/mcp');
  process.exit(1);
}

console.log("Changesets OK.");
