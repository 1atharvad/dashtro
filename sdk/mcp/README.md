# @dashtro/mcp

npx-runnable MCP server for [Dashtro](https://github.com/1atharvad/dashtro) CMS —
exposes projects, collections, documents, versions, and the realtime database
as MCP tools so Claude (or any MCP-compatible client) can read and write your
CMS content directly.

It's a pure HTTP client against your Dashtro instance's `/api/cms` — no
database access, no other install. Point it at a self-hosted instance (e.g.
the `ghcr.io/1atharvad/dashtro` Docker image) via `CMS_API_URL` and it works
from anywhere.

## Setup

1. Scaffold `.mcp.json` in your project:

   ```bash
   npx @dashtro/mcp init
   ```

2. Edit the generated `.mcp.json`, filling in your instance's `CMS_API_URL`
   and an API token (`CMS_TOKEN`):

   ```json
   {
     "mcpServers": {
       "dashtro": {
         "command": "npx",
         "args": ["-y", "@dashtro/mcp"],
         "env": {
           "CMS_API_URL": "https://<your-dashtro-instance>/api/cms",
           "CMS_TOKEN": "<your-api-token>"
         }
       }
     }
   }
   ```

3. Restart your MCP client (or reconnect, e.g. `/mcp` in Claude Code).

`.mcp.json` contains your API token — don't commit it to a shared repo
unless the token is safe for your team to see.

## Tools exposed

Projects, workspaces, schema, collections, documents (CRUD + status +
versions), and the realtime database — see
[`src/server.ts`](src/server.ts) for the full list and argument details.
Mirrors the Python `cms_mcp/server.py` server the same repo ships for direct
Python/database-level use.

## License

MIT
