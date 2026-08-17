#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "./server.js";

function runInit(): never {
  const target = join(process.cwd(), ".mcp.json");
  const existing = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};

  existing.mcpServers ??= {};
  existing.mcpServers.dashtro = {
    command: "npx",
    args: ["-y", "@dashtro/mcp"],
    env: {
      CMS_API_URL: "https://<your-dashtro-instance>/api/sdk",
      CMS_API_KEY: "<your-api-key>",
    },
  };

  writeFileSync(target, JSON.stringify(existing, null, 2) + "\n");

  console.log(
    [
      `Wrote ${target}`,
      "",
      "Next steps:",
      "  1. Replace CMS_API_URL with your running Dashtro instance's URL.",
      "  2. Replace CMS_API_KEY with an API key from your instance's settings page.",
      "  3. Restart your MCP client (or run `claude mcp` / `/mcp` to reconnect).",
    ].join("\n"),
  );
  process.exit(0);
}

async function runServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const [command] = process.argv.slice(2);

if (command === "init") {
  runInit();
} else if (command === undefined) {
  runServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}\nUsage: dashtro-mcp [init]`);
  process.exit(1);
}
