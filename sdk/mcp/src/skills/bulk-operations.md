# Bulk Operations Skill

## Purpose
Efficiently create, update, delete, or transform many documents at once using MCP tools.

---

## Rate Limit Awareness

Default: **60 requests/minute** per API key (`MCP_RATE_LIMIT`)

```bash
# Batch size recommendations:
# - Create: 40/min (leaves headroom)
# - Update: 50/min
# - Delete: 50/min
# - Read: 100/min (lighter)
```

---

## Bulk Create Pattern

```python
async def bulk_create(project_id, workspace, collection, items, batch_size=40):
    """Create multiple documents with rate limiting."""
    created = []
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        # Process batch (can run in parallel up to batch_size)
        tasks = [
            create_document(project_id, workspace, collection, item)
            for item in batch
        ]
        results = await asyncio.gather(*tasks)
        created.extend([json.loads(r) for r in results])
        
        # Progress tracking
        rtdb_update({"path": "bulk/progress", "value": {"created": len(created), "total": len(items)}})
        
        if i + batch_size < len(items):
            await asyncio.sleep(60)  # Wait for rate limit reset
    return created
```

### MCP Sequential (Safe)
```bash
# Create 100 documents sequentially (respects rate limit)
for item in items:
    create_document {project_id, workspace_name: "staging", collection_name: "posts", data: item}
    # Sleep 1s between calls
```

---

## Bulk Update Pattern

```python
async def bulk_update(project_id, workspace, collection, updates):
    """Update multiple documents by ID."""
    for doc_id, data in updates.items():
        await update_document(project_id, workspace, collection, doc_id, data)
        rtdb_update({"path": "bulk/progress", "value": {"updated": count, "total": len(updates)}})
```

### Conditional Bulk Update
```bash
# Update all draft posts to add a field
list_documents {workspace_name: "staging", collection_name: "posts", minimal: false}
# Filter: status == "draft"
# For each:
update_document {document_id: "xxx", data: {needs_review: true}}
```

---

## Bulk Status Change

```bash
# Publish all drafts in a collection
list_documents {workspace_name: "staging", collection_name: "posts", minimal: false}
# Filter where document_statuses[doc_id] == "draft"
# For each draft:
update_document_status {document_id: "xxx", status: "published"}

# Unpublish all in a category
list_documents {workspace_name: "production", collection_name: "posts", minimal: false}
# Filter by category reference
# For each:
update_document_status {document_id: "xxx", status: "draft"}
```

---

## Bulk Delete (Use with Caution!)

```bash
# Soft delete pattern (recommended): move to archive workspace
create_workspace {workspace_name: "archive"}

# For each to delete:
update_document {data: {archived: true, archived_at: timestamp}}
# Or copy to archive then delete from source
```

### Hard Delete (Irreversible)
```bash
# ONLY if absolutely certain
list_documents {workspace_name: "staging", collection_name: "old-posts", minimal: false}
# For each:
delete_document {document_id: "xxx"}

# Track in RTDB for audit
rtdb_set {path: "bulk/deleted", value: [{"id": "xxx", "collection": "posts", "timestamp": "..."}]}
```

---

## Bulk Reference Fix

```python
async def fix_broken_references(project_id, workspace, collection, field_name, old_id, new_id):
    """Replace all occurrences of old_id with new_id in a reference field."""
    docs = await list_documents(project_id, workspace, collection, minimal=False)
    for doc in docs["document_ids"]:
        data = await get_document(project_id, workspace, collection, doc, minimal=False, depth=0)
        if data.get(field_name) == old_id:
            await update_document(project_id, workspace, collection, doc, {field_name: new_id})
        elif isinstance(data.get(field_name), list) and old_id in data[field_name]:
            new_list = [new_id if x == old_id else x for x in data[field_name]]
            await update_document(project_id, workspace, collection, doc, {field_name: new_list})
```

---

## CSV/JSON Import → Bulk Create

```python
import csv
import json

async def import_csv(project_id, workspace, collection, csv_path, field_map):
    """Import CSV as documents."""
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        items = []
        for row in reader:
            doc = {}
            for csv_field, schema_field in field_map.items():
                value = row[csv_field]
                # Type conversion
                if schema_field.endswith("_id") or "reference" in schema_field:
                    doc[schema_field] = value  # Assume ID already mapped
                elif schema_field in ("price", "inventory", "order"):
                    doc[schema_field] = float(value) if value else 0
                elif schema_field in ("published", "featured", "active"):
                    doc[schema_field] = value.lower() in ("true", "1", "yes")
                else:
                    doc[schema_field] = value
            items.append(doc)
    
    return await bulk_create(project_id, workspace, collection, items)
```

---

## Progress Tracking (RTDB)

```bash
# Initialize
rtdb_set {path: "bulk/import-2026-08-16", value: {
  status: "running",
  started: "2026-08-16T10:00:00Z",
  total: 500,
  completed: 0,
  failed: 0,
  errors: []
}}

# Update during operation
rtdb_update {path: "bulk/import-2026-08-16", value: {completed: 150}}

# On error
rtdb_update {path: "bulk/import-2026-08-16", value: {
  failed: 5,
  errors: [{"doc": 150, "error": "validation failed"}]
}}

# Complete
rtdb_update {path: "bulk/import-2026-08-16", value: {
  status: "completed",
  completed_at: "2026-08-16T10:15:00Z"
}}
```

---

## Dry Run Pattern

```bash
# Always test first with dry run
# 1. Run with READ_ONLY=true (MCP_READ_ONLY=true env var)
# 2. Verify operations would succeed
# 3. Remove READ_ONLY and run for real
```

---

## Error Handling

```python
async def safe_bulk_operation(operation, items, max_retries=3):
    results = {"success": [], "failed": []}
    for item in items:
        for attempt in range(max_retries):
            try:
                result = await operation(item)
                results["success"].append({"item": item, "result": result})
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    results["failed"].append({"item": item, "error": str(e)})
                else:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
    return results
```

---

## Common Bulk Scenarios

| Scenario | Approach |
|----------|----------|
| Import 1000 blog posts | Bulk create in batches of 40, 60s between batches |
| Update SEO fields on 500 pages | Bulk update, track progress in RTDB |
| Migrate categories → tags | Bulk reference fix + create new tag refs |
| Archive old content | Soft delete (update + move workspace) |
| Fix broken author references | Bulk reference fix |
| Generate sitemap | List all published, write to RTDB/export |

---

## Monitoring

```bash
# Check progress
rtdb_get {path: "bulk/import-2026-08-16"}

# Watch for completion
# (Poll every 30s or use MCP client notifications)
```