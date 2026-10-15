# Schema Design Skill

**Purpose**: Design schema fields correctly — naming, types, relationships, and when to split schemas.

See `project-architecture.md` for the creation order (Project → Workspace → Schema → Collection → Document) and how schemas fit into the CMS hierarchy.

---

## Schema Design Rules

### Naming Conventions
- **Schema names**: `TitleCase` (e.g., `Post`, `Product`, `BlogAuthor`).
- **Field names**: `snake_case` (e.g., `first_name`, `hero_image`, `published_at`).
- Be explicit: `author_id` not `a`, `body_text` not `text`.
- Avoid reserved words (id, type, created_at, updated_at are system-generated).

### Field Types & When to Use
| Type | Use for | Example | Notes |
|------|---------|---------|-------|
| `String` | Short text, codes | title, slug, color_hex | Max ~1000 chars |
| `Textarea` | Medium plain-text blocks | short_description, summary | Multi-line, no formatting |
| `RichText` | Long-form formatted content, JSON | body, description, config_json | Max 10k chars, supports markdown/HTML |
| `Number` | Integers, floats, timestamps, counts | price, inventory, published_at (unix) | No size limit for reasonable numbers |
| `Boolean` | True/false flags | is_published, is_featured, is_deleted | True or false only |
| `Email` | Email addresses | contact_email | Validated format |
| `URL` | Web links | website, external_link | Validated format |
| `Date` | Calendar date, no time | birthday, event_date | Use `DateTime` if time matters |
| `DateTime` | Date + time | published_at, expires_at | Prefer over `Number` when human-readable dates matter |
| `Color` | Color values | theme_color, accent_color | Hex/color picker |
| `Image` | Image upload/reference | hero_image, thumbnail | |
| `File` | File upload/reference | attachment, pdf_download | |
| `ScrollLink` | In-page anchor link | jump_to_section | |
| `NestedDocument` | Embedded sub-object within the same document | address, dimensions | Data that only ever belongs to this document |
| `ReferenceDocument` | Link to ONE document in another schema | author (→ Author), category (→ Category) | Hierarchical or parent-child relationships; use for one-to-many and many-to-many by adding a `ReferenceDocument` field on each side |

There is no `ReferenceCollection` type. Model many-to-many relationships with a `ReferenceDocument` field on each side instead.

### Mandatory Patterns
- **Every schema needs one `display_name: true` field** (UI uses this as the primary label)
  - Usually the title/name field, e.g. `title`, `name`, `product_name`
- **Use `ReferenceDocument` for hierarchy** (parent, author, category)
  - Self-reference allowed: `parent` field pointing to the same schema
- **Use `NestedDocument` for data that only ever belongs to one parent** (address, dimensions)
  - Don't create a separate schema for data that's never queried independently
- **Timestamps as `Number` (unix) or `DateTime`** — pick one and be consistent within a schema
  - Avoid storing timestamps as `String`; harder for queries/sorting

### Reuse One Schema Across Many Documents — Don't Clone Schemas Per Instance
"Different content sections/items need different schemas" does **not** mean one schema per
instance of similar content. If several pieces of content share the same shape (same fields,
same types), they share **one** schema — create multiple *documents* against it, not multiple
near-identical schemas.
- **Wrong**: a landing page has 5 sections that are each just `eyebrow` + `title` + `body` → do
  not create `Organize`, `Publish`, `Flexible`, `Trust`, `Ownership` as five separate schemas.
  That's schema duplication, not modeling — five copies of the same shape drift out of sync the
  first time one gets an extra field.
- **Right**: one shared schema (e.g. `Section`) with those 3 fields, one collection (e.g.
  `Sections`), and 5 documents in it — one per section. A parent document (e.g. `LandingPage`)
  references each specific document by id via a `ReferenceDocument` field.
- Only split out a distinct schema when the shape actually differs (extra/different fields) —
  e.g. a `Contact` section with `links`/`dev_note` or an `Agent` section with a `conversation`
  list genuinely need their own schema; a plain `eyebrow`/`title`/`body` section does not.
- **Naming matters** precisely because a schema is now shared across dissimilar-sounding
  content: name it after the shape/role it plays (`Section`, `Testimonial`, `FaqItem`), not after
  any one instance's specific content — a schema named after a single section stops making sense
  the moment a second, differently-named section reuses it.

### Schema Boundaries (When to Split)
**Split into separate schemas if:**
- The data is reused across multiple contexts (e.g., Media used by Post, Product, Event → separate Media schema)
- The data has its own lifecycle/permissions (e.g., Author independent from Post)
- The entity is a first-class concept in the domain (e.g., Author, Category, Tag)

**Keep in same schema if:**
- Data only belongs to one parent and never changes outside that context
- The nested data is always accessed together
- The schema is already focused (not a kitchen-sink of 50+ fields)

### Field Count Heuristic
- **< 15 fields**: Well-designed, focused schema ✅
- **15–25 fields**: Getting complex; consider splitting
- **> 25 fields**: Split into multiple schemas + references (kitchen-sink is an anti-pattern)

---

## Reference: Available Field Types

`String`, `Number`, `Boolean`, `Email`, `Date`, `DateTime`, `Color`, `RichText`, `Textarea`, `Image`, `URL`, `File`, `ScrollLink`, `NestedDocument`, `ReferenceDocument`

This is the complete list — no other field types exist.
