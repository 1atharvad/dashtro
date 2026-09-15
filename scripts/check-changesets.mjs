import { execSync } from "node:child_process";
import { hasPendingChangeset } from "./lib/changesets.mjs";

const packages = ["sdk/js", "sdk/mcp"];

/** Paths changed relative to HEAD, per `git diff --name-only`. */
const changedFiles = () =>
  execSync("git diff --name-only HEAD", { encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);

const changed = changedFiles();
const missing = packages.filter(
  (dir) => changed.some((f) => f.startsWith(`${dir}/`)) && !hasPendingChangeset(dir),
);

if (missing.length > 0) {
  console.error(`Missing changeset for: ${missing.join(", ")}`);
  console.error(`Run: npm --prefix <package> run changeset`);
  process.exit(1);
}

console.log("Changesets OK.");
