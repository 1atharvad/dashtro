# cms_mcp — Dashtro MCP server (Python)

An [MCP](https://modelcontextprotocol.io) server that lets Claude, or any MCP-compatible client, read and write your Dashtro CMS content: projects, workspaces, schemas, collections, documents and the realtime database.

It is a plain HTTP client of your Dashtro instance's `/api/sdk/*` API, authenticated with an API key (`X-API-Key`). It never uses a user's login token and never touches the database directly. What an MCP client can do is exactly what the API key is scoped to.

## Which MCP server should I use?

| | `cms_mcp` (this) | [`@dashtro/mcp`](../sdk/mcp/) |
| --- | --- | --- |
| Runtime | Python | Node (`npx`) |
| Install | `pip install dashtro` | none, `npx -y @dashtro/mcp` |
| Tools | Same set | Same set |

Both talk to the same API and are kept in behavioral parity. If you don't already have a Python environment, use `@dashtro/mcp`. Use this one if you're in Python or want to run it from a repo checkout.

## Setup

### 1. Create an API key

In the Dashtro UI, open **Settings → API** and create a key. Scope it to only what the client needs:

- the project and collections it may touch
- read-only, or read and write

A key bound to one project can't create other projects. Only an unscoped key can use `create_project`.

### 2. Install

```bash
pip install dashtro        # installs the `dashtro-mcp` command
```

Or run from a checkout of this repo:

```bash
pip install -r cms_mcp/requirements.txt
python cms_mcp/server.py
```

### 3. Register it with your MCP client

**Claude Code**, in `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "dashtro": {
      "command": "dashtro-mcp",
      "env": {
        "CMS_API_URL": "https://<your-dashtro-instance>/api/sdk",
        "CMS_API_KEY": "${DASHTRO_API_KEY}",
        "CMS_PROJECT_ID": "<optional default project id>"
      }
    }
  }
}
```

`${DASHTRO_API_KEY}` is expanded by Claude Code from the environment it was launched in, so the key stays out of the file. Export it before starting Claude Code. If the variable is unset, the config fails to load. Other clients (for example Claude Desktop) may not expand `${...}`, so put the literal value in their config and keep that file private.

Running from a checkout instead of the installed command:

```json
{
  "mcpServers": {
    "dashtro": {
      "command": "python",
      "args": ["/absolute/path/to/cms_mcp/server.py"],
      "env": { "CMS_API_URL": "...", "CMS_API_KEY": "${DASHTRO_API_KEY}" }
    }
  }
}
```

Restart the client, or reconnect (`/mcp` in Claude Code). The server uses the stdio transport.

Don't commit a `.mcp.json` that contains a literal API key.

## Configuration

All settings are environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CMS_API_URL` | `http://localhost:7312/api/sdk` | Base URL of the SDK API. Must end in `/api/sdk`. |
| `CMS_API_KEY` | _(empty)_ | API key, sent as `X-API-Key`. Required for any real use. |
| `CMS_PROJECT_ID` | _(empty)_ | Default project. Used when a tool call omits `project_id`. |
| `MCP_READ_ONLY` | `false` | `true` disables every write tool. |
| `MCP_RATE_LIMIT` | `60` | Requests per minute per tool and key (token bucket). |
| `MCP_MAX_BODY_SIZE` | `1048576` | Maximum tool-argument size in bytes (1 MB). |
| `MCP_MAX_RETRIES` | `3` | Retries for transient failures. |
| `MCP_BASE_RETRY_DELAY` | `0.5` | First retry delay in seconds, doubled each time. |
| `MCP_MAX_RETRY_DELAY` | `30.0` | Retry delay cap in seconds. |
| `MCP_RETRY_JITTER` | `0.1` | Random jitter on retry delays (10%). |
| `MCP_CB_THRESHOLD` | `5` | Consecutive failures before the circuit breaker opens. |
| `MCP_CB_TIMEOUT` | `30.0` | Seconds the breaker stays open before testing again. |
| `MCP_CB_HALF_OPEN_MAX` | `3` | Successful test requests needed to close the breaker. |

To explore safely, start with `MCP_READ_ONLY=true` and a read-only key.

## How content is organised

```
Project
└── Workspace          ← "production" is auto-created and read-only for writes
    └── Collection     ← backed by a Schema (a set of typed fields)
        └── Document   ← draft → published
```

- **Write in a non-production workspace.** Call `create_workspace` (for example `staging`) and write documents there.
- **Schemas come first.** Create fields with `create_schema_field`, then bind a collection with `create_collection`.
- **Documents are validated** against their collection's schema. Unknown fields and wrong types are rejected.
- **Publishing is not available through MCP.** Documents start as `draft`. Going live happens by pushing to production in the CMS UI. `update_document_status` can only revert a document to `draft`.

## Tools

Tools that take `project_id` fall back to `CMS_PROJECT_ID` when it's omitted.

**Projects and workspaces**

| Tool | What it does |
| --- | --- |
| `create_project` | Create a project and its production workspace (unscoped key only). |
| `update_project` | Rename a project or change its description. |
| `delete_project` | Permanently delete a project and everything in it. |
| `create_workspace` | Create a non-production workspace to write drafts into. |

**Schema**

| Tool | What it does |
| --- | --- |
| `list_schema` | List the project's schema names. |
| `get_schema` | Get one schema's field definitions. |
| `create_schema_field` | Add a field (creates the schema on first use). |
| `delete_schema_field` | Delete a field by id. |

Field types: `String`, `Number`, `Boolean`, `Email`, `Date`, `DateTime`, `Color`, `RichText`, `Textarea`, `Image`, `URL`, `File`, `ScrollLink`, `NestedDocument`, `ReferenceDocument`. Mark one field `display_name` to use it as the document label.

**Collections and documents**

| Tool | What it does |
| --- | --- |
| `list_collections` | List collections (`minimal=true` returns only names and schema). |
| `create_collection` / `delete_collection` | Bind a collection to a schema, or delete it with its documents. |
| `list_documents` | List documents (`minimal=true` returns only ids and labels). |
| `get_document` | Fetch a document. `depth` controls how far references are expanded. |
| `create_document` / `update_document` | Write a document. Updates are merged, so send only changed keys. |
| `update_document_status` | Revert a document to `draft`. |
| `delete_document` | Permanently delete a document. |

`RichText` fields come back as the raw stored markdown and component tags, not rendered HTML, so you can edit and write them back unchanged.

**Realtime database**

| Tool | What it does |
| --- | --- |
| `rtdb_get` | Read a node (or the whole tree) by `/`-delimited path, for example `settings/homepage`. |
| `rtdb_set` | Overwrite a node. |
| `rtdb_update` | Shallow-merge an object into a node. |
| `rtdb_delete` | Delete a node. |

Not exposed, on purpose: listing all projects, renaming individual schema fields, pushing to production, and document version history. These are admin operations with no API-key equivalent.

## Resources, prompts and skills

- **Resource** `dashtro://usage`: a complete usage guide your client can read.
- **Prompts**: `create-content-workflow`, `read-content-workflow`, `schema-design-workflow`, `troubleshooting-guide`.
- **Skills**: every Markdown file in [`skills/`](skills/) is registered both as a resource (`dashtro://skills/<name>`) and as a prompt. Included: `project-architecture`, `schema-design-patterns`, `rich-text-components`, `bulk-operations`, `content-audit`, `content-migration`, `content-review`, `content-scheduling`, `multi-language`, `seo-optimization`.

Adding a `.md` file to `skills/` makes it available automatically on the next start.

## Safety and reliability

- **Rate limiting**: a per-process token bucket (`MCP_RATE_LIMIT`).
- **Input sanitization**: strings are trimmed and capped at 10,000 characters, arrays at 1,000 items, objects at 100 keys, and obvious script-injection content is rejected.
- **Body size limit**: `MCP_MAX_BODY_SIZE`.
- **Read-only mode**: `MCP_READ_ONLY=true` blocks `create_*`, `update_*`, `delete_*` and `rtdb_set`/`rtdb_update`/`rtdb_delete`.
- **Retries**: 429, 500, 502, 503 and 504 responses are retried with exponential backoff and jitter.
- **Circuit breaker**: after repeated failures requests are refused for a cool-down period instead of piling onto a struggling server.
- **Errors**: the backend's actual error detail is passed through to the client, for example which schema rule a write violated.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `401` / `403` | `CMS_API_KEY` is missing, revoked, or not scoped to that project or collection. Check **Settings → API**. |
| `project_id is required` | Set `CMS_PROJECT_ID` or pass `project_id` on the call. |
| Writes fail on `production` | Production is read-only. `create_workspace`, then write there. |
| Empty document list | Workspace name is case-sensitive and must match exactly. |
| References not expanded | Use `get_document` with `minimal=false` and a `depth` such as `3`. |
| `Rate limit exceeded` | Wait a minute, or raise `MCP_RATE_LIMIT`. |
| `Circuit breaker open` | The instance was failing repeatedly. Check `CMS_API_URL` and that the server is up, then retry after the cool-down. |
| `Write operations disabled` | `MCP_READ_ONLY=true` is set. |

## Tests

```bash
pytest cms_mcp/tests               # unit tests and the stdio protocol test
pytest -m live cms_mcp/tests/test_live_mcp.py   # against a real instance (needs .env.live)
```

The stdio test launches `server.py` as a real subprocess against a local backend and drives it over JSON-RPC.

## Keeping the two MCP servers in sync

[`sdk/mcp/`](../sdk/mcp/) is the Node port of this server. A tool or behavior change in `server.py` needs the matching change in `sdk/mcp/src/server.ts`, and the shared skill files in `skills/` are mirrored into `sdk/mcp/src/skills/`.
