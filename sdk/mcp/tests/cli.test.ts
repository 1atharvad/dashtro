/**
 * Tests src/cli.ts's `init` command via the built `dist/cli.js` (a `pretest`
 * npm script runs `npm run build` first) — spawned as a real child process
 * in a scratch cwd, since `init` writes `.mcp.json` relative to `process.cwd()`
 * and calls `process.exit()`, which isn't safe to exercise in-process.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const CLI = join(__dirname, "..", "dist", "cli.js");

let cwd: string;

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error(`${CLI} not found — run "npm run build" before the test suite`);
  }
});

afterEach(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

function runInit(): ReturnType<typeof spawnSync> {
  cwd = mkdtempSync(join(tmpdir(), "dashtro-mcp-cli-"));
  return spawnSync(process.execPath, [CLI, "init"], { cwd, encoding: "utf8" });
}

describe("dashtro-mcp init", () => {
  it("writes a fresh .mcp.json with the dashtro server entry", () => {
    const result = runInit();

    expect(result.status).toBe(0);
    const written = JSON.parse(readFileSync(join(cwd, ".mcp.json"), "utf8"));
    expect(written.mcpServers.dashtro).toEqual({
      command: "npx",
      args: ["-y", "@dashtro/mcp"],
      env: {
        CMS_API_URL: "https://<your-dashtro-instance>/api/sdk",
        CMS_API_KEY: "<your-api-key>",
      },
    });
  });

  it("merges into an existing .mcp.json without dropping other servers", () => {
    cwd = mkdtempSync(join(tmpdir(), "dashtro-mcp-cli-"));
    writeFileSync(
      join(cwd, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "other-cmd", args: [] } } }),
    );

    const result = spawnSync(process.execPath, [CLI, "init"], { cwd, encoding: "utf8" });

    expect(result.status).toBe(0);
    const written = JSON.parse(readFileSync(join(cwd, ".mcp.json"), "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "other-cmd", args: [] });
    expect(written.mcpServers.dashtro.command).toBe("npx");
  });

  it("rejects an unknown subcommand", () => {
    cwd = mkdtempSync(join(tmpdir(), "dashtro-mcp-cli-"));
    const result = spawnSync(process.execPath, [CLI, "bogus"], { cwd, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });
});
