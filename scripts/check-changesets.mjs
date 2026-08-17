import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const packages = ["sdk/js", "sdk/mcp"];

function hasPendingChangeset(dir) {
  try {
    return readdirSync(`${dir}/.changeset`).some(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return false;
  }
}

function changedFiles() {
  return execSync("git diff --name-only HEAD", { encoding: "utf-8" })
    .split("\n")
    .filter(Boolean);
}

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
