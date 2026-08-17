# Content Scheduling Skill

## Purpose
Schedule content publication/unpublication at specific times using MCP + RTDB.

---

## Architecture

```
RTDB Queue: scheduling/queue
  ├── {doc_id}: {action: "publish", run_at: 1700000000, status: "pending"}
  └── {doc_id}: {action: "unpublish", run_at: 1700010000, status: "pending"}

Worker (cron/Cloudflare Worker):
  1. rtdb_get {path: "scheduling/queue"}
  2. Filter where run_at <= now AND status == "pending"
  3. For each: execute action via MCP
  4. Update status: "completed" or "failed"
```

---

## Schedule Publication

```bash
# Schedule a draft for future publication
# 1. Ensure document exists in staging
create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {...}}

# 2. Add to schedule queue
rtdb_set {path: "scheduling/queue/doc-xxx", value: {
  action: "publish",
  project_id: "proj-123",
  workspace_name: "staging",
  collection_name: "posts",
  document_id: "doc-xxx",
  run_at: 1700000000,  # Unix timestamp (e.g., 2026-11-14 10:00:00 UTC)
  status: "pending",
  created_at: 1699900000
}}

# 3. Document stays draft until worker runs
```

## Schedule Unpublication

```bash
# Schedule content to be unpublished
rtdb_set {path: "scheduling/queue/doc-yyy", value: {
  action: "unpublish",
  project_id: "proj-123",
  workspace_name: "production",
  collection_name: "posts",
  document_id: "doc-yyy",
  run_at: 1700100000,
  status: "pending"
}}
```

---

## Recurring Schedules

```bash
# For recurring content (e.g., weekly newsletter)
rtdb_set {path: "scheduling/recurring/weekly-newsletter", value: {
  action: "publish",
  template_document_id: "template-newsletter",
  project_id: "proj-123",
  workspace_name: "staging",
  collection_name: "newsletters",
  cron: "0 9 * * 1",  # Every Monday 9 AM UTC
  timezone: "UTC",
  enabled: true,
  next_run: 1700000000
}}
```

---

## MCP Workflow for Scheduling

```bash
# 1. Create content in staging
create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {
  title: "Black Friday Sale",
  body: "...",
  publish_at: 1700000000  # Optional: store in document too
}}

# 2. Schedule publication
rtdb_set {path: "scheduling/queue/bf-sale", value: {
  action: "publish",
  project_id: "proj-123",
  workspace_name: "staging",
  collection_name: "posts",
  document_id: "doc-new",
  run_at: 1700000000,
  status: "pending"
}}

# 3. (Optional) Schedule unpublish
rtdb_set {path: "scheduling/queue/bf-sale-end", value: {
  action: "unpublish",
  project_id: "proj-123",
  workspace_name: "production",
  collection_name: "posts",
  document_id: "doc-new",
  run_at: 1700100000,
  status: "pending"
}}

# 4. View scheduled queue
rtdb_get {path: "scheduling/queue"}

# 5. Cancel scheduled action
rtdb_delete {path: "scheduling/queue/doc-xxx"}
```

---

## Worker Implementation (Pseudo-code)

```python
import asyncio
import time
from cms_mcp.server import update_document_status

async def scheduling_worker():
    while True:
        queue = await rtdb_get("scheduling/queue")
        if not queue:
            await asyncio.sleep(30)
            continue
            
        now = time.time()
        for doc_id, item in queue.items():
            if item["status"] != "pending":
                continue
            if item["run_at"] > now:
                continue
                
            # Execute
            try:
                if item["action"] == "publish":
                    await update_document_status(
                        item["project_id"],
                        item["workspace_name"],
                        item["collection_name"],
                        item["document_id"],
                        "published"
                    )
                elif item["action"] == "unpublish":
                    await update_document_status(
                        item["project_id"],
                        item["workspace_name"],
                        item["collection_name"],
                        item["document_id"],
                        "draft"
                    )
                
                # Mark completed
                await rtdb_update(f"scheduling/queue/{doc_id}", {"status": "completed", "completed_at": now})
                
            except Exception as e:
                await rtdb_update(f"scheduling/queue/{doc_id}", {
                    "status": "failed",
                    "error": str(e),
                    "retry_count": item.get("retry_count", 0) + 1
                })
        
        await asyncio.sleep(30)  # Check every 30s

# Deploy as: Cloudflare Worker, cron job, GitHub Action, or dedicated service
```

---

## Cloudflare Worker Deployment

```javascript
// workers/scheduler.js
export default {
  async scheduled(event, env, ctx) {
    const queue = await env.KV.get("scheduling:queue", { type: "json" });
    if (!queue) return;
    
    const now = Date.now() / 1000;
    for (const [docId, item] of Object.entries(queue)) {
      if (item.status !== "pending" || item.run_at > now) continue;
      
      // Call MCP tool via HTTP (or use Dashtro SDK directly)
      await fetch(`${env.CMS_API_URL}/projects/${item.project_id}/workspace/${item.workspace_name}/collection/${item.collection_name}/document/${item.document_id}/status/`, {
        method: "PATCH",
        headers: { "X-API-Key": env.CMS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ _status: item.action === "publish" ? "published" : "draft" })
      });
      
      item.status = "completed";
      item.completed_at = now;
    }
    
    await env.KV.put("scheduling:queue", JSON.stringify(queue));
  }
}
```

```toml
# wrangler.toml
[triggers]
crons = ["* * * * *"]  # Every minute
```

---

## Schedule Management via MCP

```bash
# List all scheduled
rtdb_get {path: "scheduling/queue"}

# Filter by status
# Client-side: filter where status == "pending"

# View upcoming (next 24h)
# Client-side: filter where run_at between now and now+86400

# Reschedule
rtdb_update {path: "scheduling/queue/doc-xxx", value: {run_at: 1700200000}}

# Cancel
rtdb_delete {path: "scheduling/queue/doc-xxx"}

# Retry failed
rtdb_update {path: "scheduling/queue/doc-xxx", value: {status: "pending", error: null}}
```

---

## Integration with Document Fields

```bash
# Add scheduling fields to schema
create_schema_field {schema_name: "Post", field_name: "scheduled_publish_at", field_type: "Number", index: 20}
create_schema_field {schema_name: "Post", field_name: "scheduled_unpublish_at", field_type: "Number", index: 21}
create_schema_field {schema_name: "Post", field_name: "auto_publish", field_type: "Boolean", index: 22, default: false}
```

### Auto-schedule on Create
```python
async def create_with_schedule(project_id, workspace, collection, data):
    doc = await create_document(project_id, workspace, collection, data)
    
    if data.get("auto_publish") and data.get("scheduled_publish_at"):
        await rtdb_set(f"scheduling/queue/{doc['_id']}", {
            "action": "publish",
            "project_id": project_id,
            "workspace_name": workspace,
            "collection_name": collection,
            "document_id": doc["_id"],
            "run_at": data["scheduled_publish_at"],
            "status": "pending"
        })
    
    return doc
```

---

## Monitoring & Alerts

```bash
# Health check
rtdb_get {path: "scheduling/health"}

# Expected structure:
{
  "worker_last_run": 1700000000,
  "pending_count": 5,
  "failed_count": 0,
  "stuck_count": 0  # pending but run_at > 1 hour ago
}

# Alert if:
# - worker_last_run > 5 min ago
# - failed_count > 0
# - stuck_count > 0
```

---

## Timezone Handling

```python
import pytz
from datetime import datetime

def schedule_in_timezone(run_at_local: str, timezone: str) -> int:
    """Convert '2026-11-14 10:00' in 'America/New_York' to Unix timestamp."""
    tz = pytz.timezone(timezone)
    dt = datetime.strptime(run_at_local, "%Y-%m-%d %H:%M")
    dt = tz.localize(dt)
    return int(dt.timestamp())

# Usage
run_at = schedule_in_timezone("2026-11-14 10:00", "America/New_York")
# Store run_at in queue (always UTC timestamps)
```

---

## Best Practices

1. **Always use UTC timestamps** in queue (`run_at`)
2. **Idempotent operations** — publishing published doc is safe
3. **Retry logic** — failed items auto-retry with backoff
4. **Audit trail** — keep completed items for 30 days
5. **Separate queues** — per project/environment
6. **Worker health** — monitor last run timestamp