# Content Scheduling Skill

## Purpose
Schedule content publication/unpublication at specific times using RTDB + external worker.

---

## Architecture

The workflow uses RTDB as a scheduler queue:

1. **Schedule queue in RTDB**: Store documents to be published/unpublished with a `run_at` timestamp
2. **Worker process** (cron job, Cloudflare Worker, etc.): Polls the queue every N minutes
3. **Worker executes actions**: When `run_at <= now`, call MCP tools to publish/unpublish
4. **Update status**: Mark scheduled items as "completed" or "failed"

---

## Schedule Publication

1. Create document in staging workspace (draft status)
2. Store scheduling entry in RTDB:
   - Path: `scheduling/queue/{document_id}`
   - Fields: `action: "publish"`, `run_at: <unix_timestamp>`, `status: "pending"`
3. Document remains draft until scheduled time
4. Worker polls queue, finds entries where `run_at <= now`, calls `update_document_status` to publish
5. Update status to "completed"

---

## Schedule Unpublication

1. Document is currently published
2. Store scheduling entry in RTDB:
   - Path: `scheduling/queue/{document_id}`
   - Fields: `action: "unpublish"`, `run_at: <unix_timestamp>`, `status: "pending"`
3. At scheduled time, worker calls `update_document_status` to unpublish (set to draft)

---

## Scheduling Strategies

### Batch Publishing
Schedule multiple documents to publish at the same time (e.g., launch a new feature set at 10 AM).
- Store all in queue with same `run_at` timestamp
- Worker executes them together (respecting rate limits)

### Rolling Publication
Schedule documents to publish staggered over hours/days (e.g., one blog post per day).
- Calculate `run_at` for each: `start_time + (index * delay)`
- Worker processes one document per interval

### Recurring Schedules
Archive or rotate content on a recurring schedule (e.g., archive old posts monthly).
- Not currently built-in; requires external scheduler
- Store recurring rules in RTDB, worker calculates next execution

---

## Queue Entry Structure

Each scheduled item should contain:
- `document_id`: Which document to act on
- `collection_name`: Which collection
- `workspace_name`: Which workspace
- `action`: "publish" or "unpublish"
- `run_at`: Unix timestamp (seconds since epoch)
- `status`: "pending", "completed", "failed"
- `created_at`: When the schedule was created (audit trail)
- `error` (optional): Error message if failed

---

## Worker Implementation

**Conceptual workflow:**
1. `rtdb_get` the scheduling queue
2. Filter entries where `run_at <= now` AND `status == "pending"`
3. For each entry:
   - Call `update_document_status` with appropriate action
   - If successful, `rtdb_update` status to "completed"
   - If failed, `rtdb_update` status to "failed" and log error
4. Repeat on interval (e.g., every 5 minutes)

**Worker location options:**
- Cron job on your server
- AWS Lambda (CloudWatch trigger)
- Cloudflare Worker
- GitHub Actions (scheduled workflow)
- External scheduling service (e.g., n8n, Zapier)

---

## Timezone Handling

Store timestamps in UTC (unix seconds). When scheduling:
- User provides desired time + timezone
- Convert to UTC: `local_time + user_timezone_offset`
- Store as unix timestamp in `run_at`
- Worker always operates in UTC

---

## Manual Intervention

If a scheduled action needs to be cancelled before `run_at`:
- `rtdb_update` the queue entry to `status: "cancelled"`
- Worker skips cancelled entries

If a scheduled action fails and should retry:
- `rtdb_update` `status: "pending"` again
- Worker will try again on next poll

---

## Rate Limiting Considerations

If scheduling many publications at once:
- Space them out by 60+ seconds to respect rate limits
- Or schedule in smaller batches (e.g., 40 per minute, wait, then next 40)
- Track rate limit headroom in RTDB

---

## Common Scheduling Scenarios

| Scenario | Implementation |
|----------|-----------------|
| Publish blog post tomorrow at 9 AM | Store in queue with `run_at = tomorrow 9am UTC`, worker publishes |
| Auto-archive posts older than 6 months | Cron job lists old posts, calculates `run_at = now`, queues for archival |
| Stagger release of 50 product pages | Queue all with `run_at` values spaced 60s apart, worker publishes sequentially |
| Unpublish sale page after event ends | Queue with `run_at = event_end_time`, worker unpublishes |

---

## Monitoring

1. Check queue: `rtdb_get {path: "scheduling/queue"}`
2. Count pending: Filter where `status == "pending"` and `run_at > now`
3. Check failures: Filter where `status == "failed"`
4. Audit history: Keep completed entries for a week, then archive

