# SEO Optimization Skill

## Purpose
Optimize CMS content for search engines using schema, structured data, and on-page SEO best practices.

---

## Core SEO Fields (Add to Your Schema)

```bash
# Required for every content type
create_schema_field {field_name: "seo_title", field_type: "String", index: 10, display_name: false}
create_schema_field {field_name: "meta_description", field_type: "String", index: 11}
create_schema_field {field_name: "canonical_url", field_type: "String", index: 12}
create_schema_field {field_name: "og_image", field_type: "ReferenceDocument", index: 13}  # points to media collection
create_schema_field {field_name: "og_type", field_type: "String", index: 14}  # article, website, product
create_schema_field {field_name: "twitter_card", field_type: "String", index: 15}  # summary_large_image
create_schema_field {field_name: "noindex", field_type: "Boolean", index: 16, default: false}
create_schema_field {field_name: "nofollow", field_type: "Boolean", index: 17, default: false}
create_schema_field {field_name: "structured_data", field_type: "RichText", index: 18}  # JSON-LD
```

---

## Article/BlogPost Schema (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "{{seo_title or title}}",
  "description": "{{meta_description}}",
  "image": "{{og_image.url}}",
  "datePublished": "{{published_at}}",
  "dateModified": "{{updated_at}}",
  "author": {
    "@type": "Person",
    "name": "{{author.name}}",
    "url": "{{author.url}}"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Your Brand",
    "logo": {"@type": "ImageObject", "url": "https://yoursite.com/logo.png"}
  },
  "mainEntityOfPage": {"@type": "WebPage", "@id": "{{canonical_url}}"}
}
```

---

## Product Schema (E-commerce)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{{title}}",
  "description": "{{meta_description}}",
  "image": ["{{og_image.url}}"],
  "sku": "{{sku}}",
  "brand": {"@type": "Brand", "name": "{{brand.name}}"},
  "offers": {
    "@type": "Offer",
    "url": "{{canonical_url}}",
    "priceCurrency": "USD",
    "price": "{{price}}",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "{{rating}}",
    "reviewCount": "{{review_count}}"
  }
}
```

---

## MCP Workflow for SEO

```bash
# 1. Audit existing content for missing SEO fields
list_documents {workspace_name: "staging", collection_name: "posts", minimal: false}
# Filter: where seo_title is empty OR meta_description is empty

# 2. Bulk update SEO fields
update_document {document_id: "xxx", data: {
  seo_title: "Optimized Title | Brand",
  meta_description: "Compelling 150-char description with keyword",
  og_image: "media-id-123",
  structured_data: "{...JSON-LD...}"
}}

# 3. Verify structured data renders
get_document {document_id: "xxx", depth: 1}
# Check structured_data field outputs valid JSON-LD

# 4. Submit to search consoles via RTDB queue
rtdb_set {path: "seo/indexing-queue", value: [{"url": "https://site.com/post/xxx", "type": "URL_UPDATED"}]}
```

---

## Keyword Optimization Checklist

- [ ] **Primary keyword** in: title, H1, first 100 words, URL, meta description
- [ ] **Secondary keywords** in: H2s, image alt text, body naturally
- [ ] **LSI keywords** (related terms) sprinkled throughout
- [ ] **Keyword density** 1-2% (avoid stuffing)
- [ ] **Semantic HTML** — proper heading hierarchy, lists, tables

---

## Technical SEO via CMS

| Task | MCP Tool |
|------|----------|
| Canonical URLs | `update_document {canonical_url: "..."}` |
| Robots meta | `update_document {noindex: true, nofollow: true}` |
| Sitemap generation | `rtdb_get {path: "sitemap/urls"}` → render XML |
| Redirect mapping | `rtdb_set {path: "redirects/old-url", value: "/new-url"}` |
| Page speed hints | Add `preload`, `prefetch` in structured_data |

---

## Monitoring & Alerts

```bash
# Track SEO health in RTDB
rtdb_set {path: "seo/health", value: {
  missing_titles: 0,
  missing_descriptions: 3,
  broken_canonicals: 1,
  last_audit: "2026-08-16T10:00:00Z"
}}

# Alert if issues > threshold
# (Run via cron or CI)
```