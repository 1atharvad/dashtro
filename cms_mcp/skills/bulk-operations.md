# Bulk Operations Skill

## Purpose
Efficiently create, update, delete, or transform many documents at once using MCP tools.

---

## Rate Limit Awareness

Default: **60 requests/minute** per API key (`MCP_RATE_LIMIT`)

**Batch size recommendations:**
- Create: 40/min (leaves headroom)
- Update: 50/min
- Delete: 50/min
- Read: 100/min (lighter)

Space large bulk operations across multiple minutes to stay under the limit.

---

## Bulk Create Pattern

1. List or iterate over source items (CSV, JSON, array, or query results)
2. For each item, call `create_document` with mapped fields
3. Batch into groups of ~40 (respecting rate limit)
4. Wait 60s between batches if exceeding rate limit
5. Track progress in RTDB or logs as you go

**Do NOT attempt to create 1000 documents in a tight loop.** Space them out.

---

## Bulk Update Pattern

1. `list_documents` to fetch all documents in the collection
2. Filter results by some criteria (status, field value, etc.)
3. For each matching document, `update_document` with new data
4. Track progress and errors as you proceed

**Conditional updates:** Filter in-memory after listing, then update only matching docs.

---

## Bulk Status Change

1. `list_documents` to get all docs
2. Filter by current status (e.g., "draft")
3. For each, `update_document_status` to new status

Example scenarios: publish all drafts, unpublish all in a category, mark as archived.

---

## Bulk Delete (Use with Caution!)

**Soft delete (recommended):** Instead of deleting, mark with `archived: true` and an `archived_at` timestamp, or move to an archive workspace. This preserves audit trails.

**Hard delete (irreversible):** Only if absolutely certain. Call `delete_document` for each ID. Hard-deleted data cannot be recovered.

**Always audit:** Track what was deleted (ID, collection, timestamp, reason) in RTDB for compliance.

---

## Bulk Reference Fix

When a referenced document changes ID or should point elsewhere:

1. `list_documents` in the collection that has the reference
2. For each document, `get_document` (with `minimal: false`) to inspect the reference field
3. If the field matches the old ID (or contains it in a list), `update_document` with the new ID
4. Handle both single references (`ReferenceDocument`) and multi-refs (`ReferenceCollection`)

---

## Progress Tracking (RTDB)

Use RTDB to track bulk operation state (useful for long-running imports):

1. **Initialize**: `rtdb_set` a progress object with `status: "running"`, `total`, `completed`, `failed`, `errors: []`
2. **Update**: Periodically `rtdb_update` to increment `completed` count
3. **On error**: Append to `errors` array with doc ID and error message
4. **Complete**: Update `status: "completed"` and set `completed_at` timestamp

This lets external systems poll progress without querying the CMS directly.

---

## Dry Run Pattern

Before bulk operations on production data:

1. Set `MCP_READ_ONLY=true` to prevent writes
2. Run the same operation logic (list, filter, check what would update)
3. Verify the results match expectations
4. Remove `READ_ONLY` and run for real

---

## Error Handling

Bulk operations may fail on individual items (validation errors, missing references, etc.). Do NOT stop on first error.

**Safe approach:**
- Try each operation with exponential backoff (2s, 4s, 8s between retries)
- Collect failures in a list instead of throwing
- Continue to completion
- Report summary: N succeeded, M failed, with failure details

---

## Common Bulk Scenarios

| Scenario | Approach |
|----------|----------|
| Import CSV → documents | Parse CSV, map columns to fields, batch create with rate limit spacing |
| Update many documents by field | List, filter by field value, update each with new data |
| Migrate data (old schema → new) | List old, transform fields, create in new collection, soft-delete from old |
| Fix broken references | List docs with old ref, check if field matches, update to new ref |
| Publish/unpublish by category | List, filter by category reference, update status for each |
| Archive old content | Mark with archived flag + timestamp, or move to archive workspace |
| Generate export/sitemap | List all, filter (e.g., published only), write results to file or RTDB |

---

## Monitoring

Check bulk operation progress stored in RTDB:
- `rtdb_get` the progress path to inspect current state
- Look for `completed`, `failed`, `errors` to understand how far you are

If operation hangs or errors, inspect RTDB to decide whether to retry, resume, or rollback.
