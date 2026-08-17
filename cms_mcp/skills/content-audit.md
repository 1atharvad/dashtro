# Content Audit Skill

## Purpose
Systematically audit content for quality, completeness, SEO, accessibility, and maintenance issues.

---

## Audit Types

| Audit | Frequency | Tools |
|-------|-----------|-------|
| **SEO Audit** | Monthly | list_documents, get_document, RTDB |
| **Content Quality** | Quarterly | list_documents, get_document |
| **Broken References** | Weekly | list_documents, get_document |
| **Stale Content** | Monthly | list_documents (filter by date) |
| **Orphaned Content** | Quarterly | list_collections, list_documents |
| **Accessibility** | Per publish | get_document (RichText analysis) |

---

## 1. SEO Audit

### Checks
- [ ] Title length (30-60 chars)
- [ ] Meta description (120-160 chars)
- [ ] H1 present, matches title
- [ ] Heading hierarchy (H1→H2→H3)
- [ ] Images have alt text
- [ ] Internal links (2-5 per post)
- [ ] Structured data valid JSON-LD
- [ ] Canonical URL set
- [ ] Noindex/nofollow intentional

### MCP Workflow
```bash
# 1. Get all published posts
list_documents {workspace_name: "production", collection_name: "posts", minimal: false}

# 2. For each, check SEO fields
get_document {document_id: "xxx", minimal: false, depth: 0}
# Check: seo_title, meta_description, structured_data, canonical_url

# 3. Analyze RichText body
# - Extract headings
# - Count images, check alt
# - Count internal links

# 4. Store results in RTDB
rtdb_set {path: "audit/seo/2026-08-16/doc-xxx", value: {
  title_length: 45,
  has_meta_desc: true,
  meta_desc_length: 145,
  h1_count: 1,
  h2_count: 4,
  images_total: 6,
  images_with_alt: 5,
  internal_links: 3,
  structured_data_valid: true,
  score: 85,
  issues: ["1 image missing alt text"]
}}
```

---

## 2. Broken Reference Audit

### Checks
- [ ] All ReferenceDocument fields resolve
- [ ] All ReferenceCollection fields resolve
- [ ] No references to deleted documents
- [ ] No references to draft (if published)

### MCP Workflow
```bash
# 1. Get all documents with references
list_documents {workspace_name: "production", collection_name: "posts", minimal: false}

# 2. For each, get full with depth=2
get_document {document_id: "xxx", minimal: false, depth: 2}

# 3. Check each reference field
# If reference returns 404 or null → broken

# 4. Report
rtdb_set {path: "audit/references/2026-08-16/doc-xxx", value: {
  field: "author",
  referenced_id: "author-999",
  status: "broken",
  referenced_status: "deleted"
}}
```

### Auto-Fix Pattern
```python
async def fix_broken_references(project_id, workspace, collection):
    docs = await list_documents(project_id, workspace, collection, minimal=False)
    for doc in docs["document_ids"]:
        full = await get_document(project_id, workspace, collection, doc, minimal=False, depth=2)
        for key, value in full.items():
            if isinstance(value, dict) and value.get("_error") == "not_found":
                # Reference broken - decide: remove, replace, or flag
                await update_document(project_id, workspace, collection, doc, {key: None})
```

---

## 3. Stale Content Audit

### Definition
Content not updated in > 6 months (configurable)

### Checks
- [ ] `updated_at` > 180 days ago
- [ ] Still relevant (business logic)
- [ ] Links still work
- [ ] Information accurate

### MCP Workflow
```bash
# 1. Get all published
list_documents {workspace_name: "production", collection_name: "posts", minimal: false}

# 2. Filter by updated_at
# Client-side: filter where updated_at < (now - 180 days)

# 3. Flag for review
rtdb_set {path: "audit/stale/2026-08-16/doc-xxx", value: {
  last_updated: 1690000000,
  days_stale: 245,
  action_needed: "review",
  assignee: "content-team"
}}

# 4. Generate report
rtdb_set {path: "audit/stale/2026-08-16/summary", value: {
  total_reviewed: 150,
  stale_count: 23,
  by_collection: {"posts": 15, "pages": 8},
  oldest: {"doc_id": "doc-abc", "days": 400}
}}
```

---

## 4. Orphaned Content Audit

### Definition
Content not linked from anywhere (no internal links, not in navigation, not in sitemap)

### Checks
- [ ] Not in any collection's document list (impossible in this CMS)
- [ ] Not referenced by any other document
- [ ] Not in RTDB navigation/config
- [ ] Not in sitemap

### MCP Workflow
```bash
# 1. Build reference map
all_refs = {}
for collection in all_collections:
    docs = await list_documents(project_id, "production", collection, minimal=False, depth=0)
    for doc in docs:
        for key, value in doc.items():
            if isinstance(value, str) and value.startswith("doc-"):
                all_refs.setdefault(value, []).append({"collection", "doc_id", "field": key})
            elif isinstance(value, list):
                for v in value:
                    if isinstance(v, str) and v.startswith("doc-"):
                        all_refs.setdefault(v, []).append(...)

# 2. Find orphans
all_docs = set(all_document_ids)
referenced = set(all_refs.keys())
orphans = all_docs - referenced

# 3. Report
rtdb_set {path: "audit/orphans/2026-08-16", value: {
  orphans: list(orphans),
  count: len(orphans),
  by_collection: {...}
}}
```

---

## 5. Content Quality Audit

### Automated Checks
```python
def audit_content_quality(doc):
    issues = []
    body = doc.get("body", "")
    
    # Readability
    if count_words(body) < 300:
        issues.append("Content too short (< 300 words)")
    
    # Heading structure
    headings = extract_headings(body)
    if not headings:
        issues.append("No headings (H2/H3)")
    if headings and headings[0].level != 2:
        issues.append("First heading not H2")
    
    # Images
    images = extract_images(body)
    for img in images:
        if not img.get("alt"):
            issues.append(f"Image missing alt: {img['src']}")
    
    # Links
    links = extract_links(body)
    internal = [l for l in links if is_internal(l)]
    if len(internal) < 2:
        issues.append("Fewer than 2 internal links")
    
    # Tables without headers
    tables = extract_tables(body)
    for table in tables:
        if not table.has_headers:
            issues.append("Table missing headers")
    
    return issues
```

---

## Audit Dashboard (RTDB)

```bash
# Master audit index
rtdb_set {path: "audit/index", value: {
  last_full_audit: "2026-08-16T10:00:00Z",
  audits: {
    seo: {last: "2026-08-16", issues: 45, status: "warning"},
    references: {last: "2026-08-15", issues: 3, status: "ok"},
    stale: {last: "2026-08-01", issues: 23, status: "warning"},
    orphans: {last: "2026-07-15", issues: 0, status: "ok"},
    quality: {last: "2026-08-10", issues: 67, status: "warning"}
  }
}}

# Per-audit detail
rtdb_set {path: "audit/seo/2026-08-16", value: {
  summary: {total: 150, passed: 105, warning: 30, failed: 15},
  by_collection: {"posts": {"passed": 80, "warning": 20, "failed": 10}},
  top_issues: [
    {"issue": "Missing meta description", "count": 15},
    {"issue": "Title too long", "count": 8},
    {"issue": "No H2 headings", "count": 12}
  ],
  details: {...}
}}
```

---

## Automated Audit Runner

```python
# Run via cron (daily/weekly)
async def run_full_audit(project_id):
    timestamp = datetime.utcnow().isoformat()
    
    # 1. SEO Audit
    await run_seo_audit(project_id, timestamp)
    
    # 2. Reference Audit
    await run_reference_audit(project_id, timestamp)
    
    # 3. Stale Content
    await run_stale_audit(project_id, timestamp)
    
    # 4. Orphan Audit
    await run_orphan_audit(project_id, timestamp)
    
    # 5. Quality Audit
    await run_quality_audit(project_id, timestamp)
    
    # 6. Update index
    await rtdb_set("audit/index", {last_full_audit: timestamp, ...})

# Schedule via Cloudflare Worker / GitHub Action / cron
```

---

## Remediation Workflows

### SEO Fixes
```bash
# Bulk fix missing meta descriptions
list_documents {workspace_name: "production", collection_name: "posts", minimal: false}
# For each missing:
update_document {document_id: "xxx", data: {meta_description: "Auto-generated from first 160 chars of body"}}
```

### Reference Fixes
```bash
# Replace broken author references
# 1. Find all with broken author
# 2. Map to valid author
# 3. Bulk update
```

### Stale Content
```bash
# Options:
# 1. Add "last reviewed" date
update_document {data: {last_reviewed: "2026-08-16"}}
# 2. Move to archive workspace
# 3. Assign to content owner for update
```

---

## Reporting

```bash
# Weekly audit summary
rtdb_get {path: "audit/index"}

# Export for stakeholders
# 1. rtdb_get {path: "audit/seo/latest"}
# 2. Convert to CSV/PDF
# 3. Email/Slack
```