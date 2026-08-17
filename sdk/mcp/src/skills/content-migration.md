# Content Migration Skill

## Purpose
Import, export, and transform content between systems, formats, and CMS instances.

---

## Export from DashTro CMS

### Full Project Export
```bash
# 1. Get all collections
list_collections {project_id, minimal: false}

# 2. For each collection, get all documents
list_documents {project_id, workspace_name: "production", collection_name: "posts", minimal: false}

# 3. For each document, get full content with references
get_document {project_id, workspace_name: "production", collection_name: "posts", document_id: "xxx", minimal: false, depth: 5}

# 4. Export schemas
list_schema {project_id}
get_schema {project_id, schema_name: "Post"}  # repeat for each
```

### Export Format (JSON Lines)
```jsonl
{"type": "schema", "name": "Post", "fields": [...]}
{"type": "collection", "name": "posts", "schema": "Post"}
{"type": "document", "collection": "posts", "id": "xxx", "data": {...}, "status": "published", "version": 3}
{"type": "document", "collection": "posts", "id": "yyy", "data": {...}, "status": "draft", "version": 1}
```

---

## Import to DashTro CMS

### Prerequisites
1. Target project exists (or create: `create_project`)
2. Workspaces exist (`create_workspace`)
3. Schemas created (`create_schema_field` × N)
4. Collections created (`create_collection`)

### Import Script Pattern
```python
async def import_content(project_id, workspace, data_file):
    for line in data_file:
        item = json.loads(line)
        
        if item["type"] == "schema":
            for field in item["fields"]:
                await create_schema_field(project_id, **field)
            await create_collection(project_id, item["name"], item["name"])
            
        elif item["type"] == "document":
            # Resolve reference IDs (map old IDs → new IDs)
            data = remap_references(item["data"], id_map)
            
            created = await create_document(project_id, workspace, item["collection"], data)
            new_id = created["_id"]
            id_map[item["id"]] = new_id
            
            if item["status"] == "published":
                await update_document_status(project_id, workspace, item["collection"], new_id, "published")
```

---

## Common Migration Scenarios

### WordPress → DashTro
| WordPress | DashTro |
|-----------|---------|
| Posts | Collection "posts" (schema "Post") |
| Pages | Collection "pages" (schema "Page") |
| Categories/Tags | ReferenceCollection or ReferenceDocument |
| Media Library | RTDB or separate "media" collection |
| ACF Fields | Schema fields (map types) |

### Contentful → DashTro
```bash
# Contentful export includes sys.id, fields, contentType
# Map contentType → schema, fields → schema fields
# sys.id → document _id (preserve for reference mapping)
```

### Sanity → DashTro
```bash
# Sanity documents have _id, _type, references as _ref
# _type → collection name
# _ref → ReferenceDocument (resolve after all imports)
```

### Headless CMS Generic
```json
{
  "source": "any",
  "mapping": {
    "title": "title",
    "body": "content",
    "author": {"type": "reference", "collection": "authors"},
    "tags": {"type": "array", "item_type": "reference", "collection": "tags"},
    "seo": {"type": "object", "fields": ["meta_title", "meta_desc"]}
  }
}
```

---

## Reference Resolution Strategy

```python
# Two-pass import:
# Pass 1: Create all documents, store old_id → new_id mapping
# Pass 2: Update reference fields using mapping

async def resolve_references(project_id, workspace, collection, id_map):
    docs = await list_documents(project_id, workspace, collection, minimal=False)
    for doc in docs["document_ids"]:
        data = await get_document(project_id, workspace, collection, doc, minimal=False, depth=0)
        updated = {}
        for key, value in data.items():
            if isinstance(value, str) and value in id_map:
                updated[key] = id_map[value]
            elif isinstance(value, list):
                updated[key] = [id_map.get(v, v) for v in value]
        if updated:
            await update_document(project_id, workspace, collection, doc, updated)
```

---

## Bulk Operations via MCP

### Batch Create (Parallel)
```bash
# Use multiple create_document calls in parallel
# Rate limit: 60 RPM default → batch in groups of 50/min
```

### Batch Update
```bash
# For each document needing update:
update_document {document_id: "xxx", data: {field: "new-value"}}
# Track progress in RTDB
rtdb_update {path: "migration/progress", value: {completed: 150, total: 500}}
```

### Batch Status Change
```bash
# Publish all drafted in a collection
list_documents {workspace_name: "staging", collection_name: "posts", minimal: false}
# Filter where status == "draft"
# For each: update_document_status {status: "published"}
```

---

## Rollback Strategy

```bash
# Before migration, snapshot current state
rtdb_set {path: "migration/snapshots/pre-migration", value: {
  collections: [...],
  document_counts: {...},
  timestamp: "2026-08-16T10:00:00Z"
}}

# If issues, restore:
# 1. Delete new collections/documents
# 2. Restore from snapshot (manual or scripted)
```

---

## Validation Checklist

- [ ] Document counts match (source = target)
- [ ] All references resolve (no broken links)
- [ ] Statuses correct (published/draft)
- [ ] Rich text renders correctly
- [ ] Media references work
- [ ] SEO fields populated
- [ ] RTDB/config migrated