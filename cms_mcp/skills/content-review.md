# Content Review & QA Skill

## Purpose
Systematically review content for quality, SEO, accessibility, and consistency before publishing.

## When to Use
- Before publishing any document
- Batch reviewing multiple documents
- Content audit workflows
- Quality assurance before major releases

---

## Review Checklist

### SEO & Discoverability
- Title length: 30–60 chars, contains primary keyword
- Meta description: 120–160 chars, compelling, keyword-included
- H1 present and matches title (one per page only)
- Heading hierarchy is logical (H1 → H2 → H3)
- Alt text on all images (descriptive, keyword-relevant)
- Internal links present (2–5 recommended per article)
- Schema markup is valid (ArticleSchema, BlogPostingSchema, etc.)

### Content Quality
- Readability: short sentences, active voice, subheadings every ~300 words
- Accuracy: facts verified, sources cited
- Completeness: covers topic thoroughly, no placeholder text or TODOs
- Tone: matches brand voice guide and style
- Formatting: bullets, bold, code blocks used appropriately for readability

### Accessibility (WCAG 2.1 AA)
- Color contrast: text ≥ 4.5:1 (light on dark or dark on light)
- Link text: descriptive (avoid "click here", use meaningful text)
- Heading structure: semantic, not visual (H2 logically follows H1)
- Images: have alt text, or `alt=""` for purely decorative images
- Tables: have headers and captions for context

### CMS-Specific
- Schema fields: all required fields populated, no empty required fields
- Reference fields: all point to valid, published (not draft) documents
- Status: set correctly (draft → staging → published)
- Workspace: confirm document is in the correct workspace before publishing

---

## Review Workflow

1. **List documents needing review** — use `list_documents` with `minimal: true` for a quick list
2. **Fetch full document** — `get_document` with `minimal: false` and `depth: 2` to inspect full content and first-level references
3. **Check references** — for each ReferenceDocument field, verify the referenced document exists and is published
4. **Apply fixes** — if issues found, use `update_document` to fix fields or `update_document_status` to change status
5. **Track progress** — store review results (approved/rejected, reviewer name, notes) in RTDB or external tracking

---

## Automated Checks

Pre-compute common checks:
- Title length check
- Meta description presence
- Heading hierarchy (count H1, H2, H3)
- Alt text on images (scan RichText for `<img>` tags)
- Broken references (check resolved document IDs)
- Required fields populated (no empty values on required fields)

Store automated results in RTDB for agents to reference during manual review.

---

## Common Fixes

| Issue | How to Fix |
|-------|-----------|
| Title too long for SEO | `update_document` with a shorter, keyword-rich title |
| Missing meta description | `update_document` with 120–160 char description |
| Broken reference link | `update_document` with a valid document ID (or null to clear) |
| Empty required field | `update_document` with a meaningful value |
| Content in wrong workspace | Create document in correct workspace, `update_document_status` to published, then delete from old workspace |
| Outdated or inaccurate info | `update_document` with corrected content |

---

## Batch Review Pattern

For reviewing multiple documents (e.g., a whole collection):

1. `list_documents` for the collection with `minimal: false` (only if manageable volume, e.g., <100 docs)
2. Store list in RTDB as a "review queue": `[{doc_id, reviewer, status, notes}]`
3. Assign each document to a reviewer (round-robin or by expertise)
4. Each reviewer:
   - `get_document` and manually review against checklist
   - Apply fixes via `update_document`
   - Mark review complete in queue
5. Track completion rate in RTDB

---

## QA Before Publishing

Before moving document from draft → published:

1. ✅ Title is SEO-friendly
2. ✅ Meta description is present
3. ✅ All required fields filled (no empty strings on required fields)
4. ✅ All reference fields resolve (no broken links)
5. ✅ Heading structure is valid (H1, then H2+)
6. ✅ Images have alt text
7. ✅ Tone matches brand voice
8. ✅ No placeholder text or incomplete sections
9. ✅ Document is in correct workspace (staging/production)
10. ✅ Status will be set to "published" (not "draft")

Only publish after all checks pass.

---

## Review Delegation

For teams:
- Assign documents to reviewers based on expertise (SEO expert → SEO checks, writer → content quality)
- Use RTDB to track who reviewed what and when
- Require sign-off before publication
- Log review history for audit/compliance

