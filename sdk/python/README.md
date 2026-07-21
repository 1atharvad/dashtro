# dashtro-client

Python client SDK for the [Dashtro](https://github.com/1atharvad/dashtro) CMS
API — scoped, API-key-authenticated access to a project's documents and
realtime database from external apps (`/api/sdk/*` on your Dashtro instance).

## Install

```bash
pip install dashtro-client
```

## Usage

```python
from dashtro_client import DashtroClient

client = DashtroClient(
    base_url="https://admin.example.com",
    project_id="<project-id>",
    api_key="<api-key>",
    workspace="production",  # optional, defaults to "production"
    cache_ttl=60,            # optional, seconds, defaults to 60
)

post = client.get_document("blog-posts", "<document-id>")
all_posts = client.get_all_documents("blog-posts")

# Realtime database
client.rtdb.set("/counters/views", 1)

client.close()  # or: with DashtroClient(...) as client: ...
```

An `AsyncDashtroClient`/`AsyncRtdbClient` pair with the same API (`await`ed,
`aclose()` instead of `close()`) is available for asyncio code.

API keys are issued and scoped (per collection, read/write) from your
Dashtro instance's settings page.

## License

ISC
