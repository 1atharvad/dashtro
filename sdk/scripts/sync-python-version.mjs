// Run after `changeset version` bumps sdk/js/package.json + CHANGELOG.md.
// Mirrors that same version (and changelog entry) into sdk/python, so both
// SDKs release in lockstep from one Changesets flow — see
// sdk/js/.changeset/README.md for why.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const jsPkg = JSON.parse(readFileSync("sdk/js/package.json", "utf8"));
const version = jsPkg.version;

const pyprojectPath = "sdk/python/pyproject.toml";
const pyproject = readFileSync(pyprojectPath, "utf8");
const updatedPyproject = pyproject.replace(
  /^version = "[^"]+"$/m,
  `version = "${version}"`
);
if (updatedPyproject === pyproject) {
  throw new Error(`Could not find a version = "..." line in ${pyprojectPath}`);
}
writeFileSync(pyprojectPath, updatedPyproject);

// Pull the newest entry (everything between the first "## " heading and the
// next one) out of the JS changelog and mirror it, verbatim, into Python's.
const jsChangelog = readFileSync("sdk/js/CHANGELOG.md", "utf8");
const headingRe = /^## .+$/m;
const firstHeading = jsChangelog.match(headingRe);
if (!firstHeading) throw new Error("No version heading found in sdk/js/CHANGELOG.md");
const start = firstHeading.index;
const rest = jsChangelog.slice(start + firstHeading[0].length);
const nextHeadingMatch = rest.match(headingRe);
const entryBody = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
const entry = (`## ${version}` + entryBody).trim() + "\n";

const pyChangelogPath = "sdk/python/CHANGELOG.md";
const header = "# Changelog\n\nVersion kept in lockstep with `@dashtro/client` " +
  "(sdk/js) via Changesets — see sdk/js/.changeset/README.md.\n";
const existing = existsSync(pyChangelogPath)
  ? readFileSync(pyChangelogPath, "utf8").replace(header, "")
  : "";
writeFileSync(pyChangelogPath, `${header}\n${entry}\n${existing.trimStart()}`);

console.log(`Synced sdk/python to v${version}`);
