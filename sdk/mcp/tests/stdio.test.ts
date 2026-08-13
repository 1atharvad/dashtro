/**
 * Proves sdk/mcp/dist/cli.js (the actually-published @dashtro/mcp binary)
 * works over the real MCP stdio/JSON-RPC transport, not just against a
 * stubbed global fetch the way server.test.ts's tests exercise it. Runs
 * entirely locally via `npm run test` — no staging URL, no pasted API key,
 * no manual verification step — so this same proof is repeatable in CI.
 *
 * Spawns the real built CLI as a child process (StdioClientTransport +
 * Client from the MCP SDK, the same classes a real MCP host like Claude
 * Desktop/Code uses), pointed at a small local HTTP server that stands in
 * for a Dashtro backend's /api/sdk/* surface — enough of it to prove tool
 * discovery, JSON-RPC framing, and stdio piping genuinely work end-to-end,
 * without needing the Python cms_backend running (that integration is
 * covered separately, in-process, by cms_backend's own test suite).
 */

import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import lifecycleData from "./fixtures/stdio-lifecycle.json";

const CLI = join(__dirname, "..", "dist", "cli.js");

/** A minimal in-memory stand-in for the /api/sdk/* surface this test's tool calls need. */
function createFakeBackend() {
  const projects = new Map<string, { _id: string; name: string; description: string }>();
  let nextId = 1;

  const server = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(payload === undefined ? "" : JSON.stringify(payload));
      };

      if (req.method === "POST" && req.url === "/api/sdk/projects/") {
        const data = body ? JSON.parse(body) : {};
        const id = `proj-${nextId++}`;
        const project = { _id: id, name: data.name, description: data.description ?? "" };
        projects.set(id, project);
        return send(201, project);
      }

      const workspaceMatch = req.url?.match(/^\/api\/sdk\/projects\/([^/]+)\/workspaces\/$/);
      if (req.method === "POST" && workspaceMatch) {
        const data = body ? JSON.parse(body) : {};
        return send(201, {
          workspace_name: data.workspace_name,
          is_production: false,
          created_at: new Date().toISOString(),
        });
      }

      const deleteMatch = req.url?.match(/^\/api\/sdk\/projects\/([^/]+)\/$/);
      if (req.method === "DELETE" && deleteMatch) {
        projects.delete(deleteMatch[1]);
        res.writeHead(204);
        return res.end();
      }

      send(404, { detail: "not found in fake backend" });
    });
  });

  return server;
}

describe("dashtro-mcp over real stdio JSON-RPC", () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(`${CLI} not found — run "npm run build" before the test suite`);
    }
  });

  beforeEach(async () => {
    httpServer = createFakeBackend();
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/sdk`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /**
   * Spawns dist/cli.js as a real child process (no args, so it starts the
   * MCP server rather than the `init` command), connects a real MCP
   * Client to it over stdio, and confirms tool discovery lists the
   * authoring tools added this session before driving create_project ->
   * create_workspace -> delete_project through actual JSON-RPC calls,
   * checking each real response body along the way.
   */
  it("discovers tools and drives create_project -> create_workspace -> delete_project for real", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI],
      env: { ...process.env, CMS_API_URL: baseUrl, CMS_API_KEY: "test-key" } as Record<string, string>,
    });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      expect(names).toContain("create_project");
      expect(names).toContain("create_workspace");
      expect(names).toContain("delete_project");
      expect(names).toContain("create_schema_field");
      expect(names).toContain("create_collection");

      const createResult = await client.callTool({
        name: "create_project",
        arguments: lifecycleData.project,
      });
      const created = JSON.parse((createResult.content as any)[0].text);
      expect(created.name).toBe(lifecycleData.project.name);
      const projectId = created._id;

      const wsResult = await client.callTool({
        name: "create_workspace",
        arguments: { project_id: projectId, ...lifecycleData.workspace },
      });
      const workspace = JSON.parse((wsResult.content as any)[0].text);
      expect(workspace.workspace_name).toBe(lifecycleData.workspace.workspace_name);

      const deleteResult = await client.callTool({
        name: "delete_project",
        arguments: { project_id: projectId },
      });
      const deleted = JSON.parse((deleteResult.content as any)[0].text);
      expect(deleted).toEqual({ deleted: projectId });
    } finally {
      await client.close();
    }
  });
});
