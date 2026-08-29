# SEO Optimization Skill

## Purpose
Optimize CMS content for search engines using schema, structured data, and on-page SEO best practices.

---

## Core SEO Fields

Add these fields to content schemas to support SEO:

| Field | Type | Purpose | Length |
|-------|------|---------|--------|
| `seo_title` | String | HTML `<title>` (search result headline) | 30–60 chars |
| `meta_description` | String | HTML `<meta description>` (search snippet) | 120–160 chars |
| `canonical_url` | String | Canonical URL (if content is syndicated or duplicated) | Full URL |
| `og_image` | ReferenceDocument | Open Graph image (shared on social media) | Points to media doc |
| `og_type` | String | Open Graph type (article, website, product) | Enum: article, website, product, etc. |
| `twitter_card` | String | Twitter Card type (summary, summary_large_image) | Enum |
| `noindex` | Boolean | Prevent indexing by search engines | true/false |
| `nofollow` | Boolean | Prevent following links on page | true/false |
| `structured_data` | RichText | JSON-LD schema for rich snippets | JSON string (10k max) |

---

## Structured Data (JSON-LD)

Structured data tells search engines what type of content you have.

### Article/BlogPost
For blog posts, use ArticleSchema:
- Headline, description, image
- Published date, modified date
- Author (Person with name)
- Publisher (Organization)
- Main entity (WebPage ID = canonical URL)

### Product
For e-commerce products, use ProductSchema:
- Product name, description, image
- SKU, brand
- Offers (price, currency, availability)
- Ratings (if applicable)

### FAQ
For FAQs, use FAQPageSchema:
- Array of Q&A items
- Each: question + answer

### Event
For events, use EventSchema:
- Event name, description
- Start/end dates
- Location, organizer
- Ticket URL

### Local Business
For brick-and-mortar locations, use LocalBusinessSchema:
- Name, address, phone
- Hours of operation
- Service area

---

## On-Page SEO Best Practices

### Title & Meta Description
- **Title**: 30–60 chars, includes primary keyword, brand name (optional)
- **Meta Description**: 120–160 chars, compelling, includes keyword, calls to action
- **H1**: One per page, matches title conceptually
- **Headings**: H1 → H2 → H3 hierarchy (don't skip levels)

### Content
- **Keyword density**: Primary keyword 1–2% of word count (natural, not stuffed)
- **Readability**: Short paragraphs (3–4 sentences), subheadings every 300 words
- **Links**: 2–5 internal links per article (to related content), 1–2 external links (authoritative sources)
- **Images**: One every 100–200 words, descriptive alt text

### Technical SEO
- **Canonical URL**: Set for syndicated/duplicate content to avoid penalty
- **Noindex**: Set on thin/low-value pages (search filters, thank-you pages, duplicates)
- **Nofollow**: Set on untrusted external links (affiliate, UGC)
- **Mobile optimization**: Responsive design (verified by frontend team)
- **Page speed**: <3s load time (verified by performance monitoring)

---

## Structured Data Guidelines

### When to Use
- Blog posts: Always use ArticleSchema
- Products: Always use ProductSchema
- Events: Always use EventSchema
- FAQs: Use FAQPageSchema if you have ≥3 Q&A items
- Local business: Only if you have physical locations

### JSON-LD Best Practices
- Valid JSON syntax (valid JSON-LD validation tools)
- Complete: include all recommended properties
- Accurate: values match actual page content
- Unique: schema reflects this specific content, not boilerplate
- Updated: refresh when content changes

### Validation
Use structured data validators:
- Google Structured Data Testing Tool
- Schema.org validator
- Yoast Schema tool

---

## SEO Audit Workflow

1. **List all documents** in collection
2. **Check for missing SEO fields**: seo_title, meta_description, structured_data
3. **Check title/meta length**: 30–60 chars for title, 120–160 for meta
4. **Verify structured data validity**: Parse JSON-LD, ensure it matches schema
5. **Check for duplicate meta descriptions**: Same meta on multiple pages = bad
6. **Verify canonical URLs**: If set, they should be absolute URLs
7. **Check noindex/nofollow flags**: Should only be set intentionally
8. **Report findings** in RTDB or audit log

---

## Bulk SEO Updates

### Add Missing Structured Data
1. List documents lacking `structured_data`
2. For each, generate appropriate JSON-LD (ArticleSchema, ProductSchema, etc.)
3. `update_document` with generated structured_data

### Optimize Titles & Descriptions
1. List documents with missing or short seo_title/meta_description
2. Generate optimized versions (keyword research needed)
3. `update_document` with new values

### Fix Duplicate Meta Descriptions
1. List all documents, extract meta_description values
2. Find duplicates (group by description)
3. For duplicates, create unique descriptions (add detail, article number, etc.)

---

## Mobile & Page Speed Considerations

**Mobile SEO:**
- Responsive design (frontend responsibility)
- Mobile-first indexing (all content visible on mobile)
- Touch-friendly links and buttons (UX responsibility)

**Page Speed:**
- Image optimization (compress before uploading)
- Lazy loading (implemented by frontend)
- Caching (server-side, frontend responsibility)

CMS content strategy:
- Don't bloat documents with unnecessary content
- Use ReferenceDocument/Collection instead of embedding everything
- Lazy-load references (`depth: 1` initially, `depth: 2` on demand)

---

## Common SEO Scenarios

| Scenario | Action |
|----------|--------|
| Blog post published | Ensure seo_title, meta_description, ArticleSchema set |
| Product added to catalog | Set ProductSchema, pricing, availability, image |
| Content updated | Refresh structured_data if data changed (dates, prices, etc.) |
| Content duplicated (syndication) | Set canonical URL to original source |
| Search result snippet too short | Expand meta_description to 120+ chars |
| No rich snippets showing | Validate JSON-LD syntax, ensure schema matches content |
| Thin/low-value page | Set noindex if not worth ranking |

---

## Monitoring & Reporting

1. **Search Console**: Submit sitemap, monitor impressions/clicks in search results
2. **Analytics**: Track organic traffic by page, bounce rate, conversion rate
3. **RTDB tracking**: Store SEO audit results timestamped for trend analysis
4. **Monthly reports**: Compare SEO metrics month-over-month

