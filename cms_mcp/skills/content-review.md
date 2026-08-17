# Content Review & QA Skill

## Purpose
Systematically review content for quality, SEO, accessibility, and consistency before publishing.

## When to Use
- Before publishing any document
- Batch reviewing multiple documents
- Content audit workflows

---

## Review Checklist

### SEO & Discoverability
- [ ] **Title** ≤ 60 chars, contains primary keyword
- [ ] **Meta description** ≤ 160 chars, compelling, includes keyword
- [ ] **H1** matches title, only one per page
- [ ] **Heading hierarchy** (H1 → H2 → H3) is logical
- [ ] **Alt text** on all images (descriptive, keyword-relevant)
- [ ] **Internal links** to related content (2-5 per article)
- [ ] **Schema markup** present (Article, BlogPosting, etc.)

### Content Quality
- [ ] **Readability** — short sentences, active voice, subheadings every 300 words
- [ ] **Accuracy** — facts verified, sources cited
- [ ] **Completeness** — covers topic thoroughly, no placeholder text
- [ ] **Tone** — matches brand voice guide
- [ ] **Formatting** — bullets, bold, code blocks used appropriately

### Accessibility (WCAG 2.1 AA)
- [ ] **Color contrast** ≥ 4.5:1 for text
- [ ] **Link text** descriptive (no "click here")
- [ ] **Heading structure** semantic, not visual
- [ ] **Images** have alt text or `alt=""` for decorative
- [ ] **Tables** have headers and captions

### CMS-Specific
- [ ] **Schema fields** all populated (no required fields empty)
- [ ] **Reference fields** point to valid, published documents
- [ ] **Status** set correctly (draft → published)
- [ ] **Workspace** correct (not writing to production directly)

---

## MCP Workflow

```bash
# 1. List documents needing review (minimal for speed)
list_documents {project_id, workspace_name: "staging", collection_name: "posts", minimal: true}

# 2. Fetch full document for review
get_document {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", minimal: false, depth: 2}

# 3. Check references resolve
get_document {project_id, workspace_name: "staging", collection_name: "authors", document_id: "author-ref", minimal: false}

# 4. After fixes, publish
update_document_status {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", status: "published"}
```

---

## Automated Checks (Run via MCP)

```python
# Pseudo-code for automation
def audit_document(doc):
    issues = []
    if len(doc.title) > 60: issues.append("Title too long for SEO")
    if not doc.meta_description: issues.append("Missing meta description")
    if not has_heading_hierarchy(doc.body): issues.append("No H2/H3 structure")
    if missing_alt_text(doc.body): issues.append("Images missing alt text")
    if broken_references(doc): issues.append("Broken reference links")
    return issues
```

---

## Common Fixes

| Issue | Fix |
|-------|-----|
| Title too long | `update_document {data: {title: "Shorter SEO-friendly title"}}` |
| Missing meta | `update_document {data: {meta_description: "..."}}` |
| Broken reference | `update_document {data: {author: "valid-author-id"}}` |
| Empty required field | `update_document {data: {field: "value"}}` |
| Wrong workspace | Re-create in correct workspace, delete from production |

---

## Batch Review Pattern

```bash
# Get all draft documents
list_documents {workspace_name: "staging", collection_name: "posts", minimal: false}

# For each: review → fix → publish
# Track in a spreadsheet or use RTDB for review queue:
rtdb_set {path: "review/queue", value: [{doc_id, reviewer, status, notes}]}
```