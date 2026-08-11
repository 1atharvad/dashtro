# @dashtro/mcp

npx-runnable MCP server for [Dashtro](https://github.com/1atharvad/dashtro) CMS —
exposes schema, collections, documents, and the realtime database as MCP
tools so Claude (or any MCP-compatible client) can read and write your CMS
content directly.

It's a pure HTTP client against your Dashtro instance's `/api/sdk` — the
same API-key-authorized surface the client SDKs use, never a user's JWT. No
database access, no other install. Point it at a self-hosted instance (e.g.
the `ghcr.io/1atharvad/dashtro` Docker image) via `CMS_API_URL` and it works
from anywhere.

## Setup

1. Scaffold `.mcp.json` in your project:

   ```bash
   npx @dashtro/mcp init
   ```

2. Edit the generated `.mcp.json`, filling in your instance's `CMS_API_URL`
   and an API key (`CMS_API_KEY`) issued from the CMS's settings page:

   ```json
   {
     "mcpServers": {
       "dashtro": {
         "command": "npx",
         "args": ["-y", "@dashtro/mcp"],
         "env": {
           "CMS_API_URL": "https://<your-dashtro-instance>/api/sdk",
           "CMS_API_KEY": "<your-api-key>"
         }
       }
     }
   }
   ```

3. Restart your MCP client (or reconnect, e.g. `/mcp` in Claude Code).

`.mcp.json` contains your API key — don't commit it to a shared repo unless
the key is safe for your team to see. Scope the key (project/collections,
read vs. write) to only what the MCP client should be able to touch.

## Tools exposed

Schema, collections, documents (CRUD + status), and the realtime database —
see [`src/server.ts`](src/server.ts) for the full list and argument details.
Mirrors the Python `cms_mcp/server.py` server the same repo ships for direct
Python/database-level use. Project listing, workspace admin (list/push-to-
production), and document version history aren't exposed here — those are
JWT-only operations with no API-key-authorized equivalent, so they're out of
reach for an MCP client by design.

## License

MIT
