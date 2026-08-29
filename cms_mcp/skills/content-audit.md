# Content Audit Skill

## Purpose
Systematically audit content for quality, completeness, SEO, accessibility, and maintenance issues.

---

## Audit Types

| Audit | Frequency | Purpose |
|-------|-----------|---------|
| SEO Audit | Monthly | Check title length, meta descriptions, heading structure, alt text, internal links |
| Content Quality | Quarterly | Verify accuracy, completeness, tone, formatting consistency |
| Broken References | Weekly | Find documents that reference deleted or invalid IDs |
| Stale Content | Monthly | Identify old content by last-modified date |
| Orphaned Content | Quarterly | Find documents with no incoming references |
| Accessibility | Per publish | Check color contrast, alt text, semantic structure |

---

## 1. SEO Audit

### Checks to Perform
- Title length: 30–60 chars
- Meta description: 120–160 chars
- H1 present and matches title (only one per page)
- Heading hierarchy is logical (H1 → H2 → H3)
- Images have descriptive alt text
- Internal links present (2–5 recommended per article)
- Structured data is valid JSON-LD
- Canonical URL set (if applicable)
- Noindex/nofollow tags intentional

### Workflow
1. `list_documents` for all published content
2. For each document, `get_document` with `minimal: false` to inspect SEO fields
3. Extract and analyze RichText body: count headings, images, internal links
4. Compare actual values against expected ranges
5. Store results in RTDB (one entry per document per audit run) for trend tracking

---

## 2. Broken Reference Audit

### Checks to Perform
- All `ReferenceDocument` fields point to valid documents
- All `ReferenceCollection` fields contain only valid document IDs
- No references to deleted documents
- No references to draft documents from published content

### Workflow
1. `list_documents` for all documents in the collection
2. For each, `get_document` with `depth: 2` to resolve reference fields
3. Check if each referenced document exists and is accessible
4. If any reference fails to resolve, log as broken
5. Store broken reference details in RTDB for manual review

### Auto-Fix
Only fix broken references if you have a known mapping (old ID → new ID). Otherwise, flag for manual review.

---

## 3. Stale Content Audit

### Definition
Content that hasn't been updated in N months (e.g., 6+ months).

### Workflow
1. `list_documents` with `minimal: false` to see timestamps
2. Calculate age: compare `updated_at` (or `created_at`) to current date
3. Filter documents older than threshold (6 months, 1 year, etc.)
4. Review for relevance: still accurate? needs refresh? should be archived?

---

## 4. Orphaned Content Audit

### Definition
Documents that no other document references (incoming links = 0).

### Workflow
1. `list_documents` for all documents in all collections
2. For each collection, scan ReferenceDocument and ReferenceCollection fields
3. Build a map: which documents are referenced by which
4. Documents not in the map are orphaned
5. Review orphaned docs: are they intentionally isolated? archive them?

---

## 5. Accessibility Audit

### Checks to Perform
- RichText fields have adequate color contrast (4.5:1 for text)
- Link text is descriptive (not "click here")
- Heading structure is semantic
- Images have meaningful alt text (or `alt=""` for decorative images)
- Tables have headers and captions

### Workflow
1. `get_document` with `minimal: false` for each document
2. Parse RichText fields to extract HTML/markdown
3. Analyze: count headings, images, links, table elements
4. Check patterns: do all images have alt? are headings nested logically?
5. Report issues per document

---

## Storing Results in RTDB

Structure audit results by date and type:
- Path: `audit/{audit_type}/{date}/`
- One entry per document per audit
- Include: document ID, issues found, severity (high/medium/low), score
- Use this for historical trend tracking and compliance reporting

---

## Common Audit Scenarios

| Scenario | Approach |
|----------|----------|
| Monthly SEO check | List published, analyze titles/metas, store scores |
| Find broken author refs | List docs, check author field resolves, report broken |
| Archive old blog posts | List, filter by date, move to archive workspace |
| Prepare for accessibility audit | List all, analyze RichText for contrast/alt text |
| Check for orphaned media | List media collection, scan for incoming refs |

---

## Best Practices

1. **Audit before publishing**: Run automated checks on staging before moving to production
2. **Track history**: Store audit results in RTDB timestamped so you can see trends
3. **Fix high-severity issues first**: Focus on broken references, missing required fields, SEO basics
4. **Schedule recurring audits**: Monthly for SEO, quarterly for stale/orphaned content
5. **Combine manual + automated**: Automated checks catch obvious issues; manual review catches nuance
