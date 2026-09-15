import { readdirSync } from "node:fs";

/** True if `dir/.changeset` has a pending (non-README) changeset file. */
export const hasPendingChangeset = (dir) => {
  try {
    return readdirSync(`${dir}/.changeset`).some(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return false;
  }
};
