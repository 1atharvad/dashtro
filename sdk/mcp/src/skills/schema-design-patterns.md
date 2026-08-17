# Schema Design Patterns

## Purpose
Reusable schema patterns for common content types. Copy, customize, and deploy via MCP.

---

## Pattern 1: Blog/Article

```bash
# Schema: Post
create_schema_field {schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Post", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Post", field_name: "excerpt", field_type: "String", index: 3}
create_schema_field {schema_name: "Post", field_name: "body", field_type: "RichText", index: 4}
create_schema_field {schema_name: "Post", field_name: "hero_image", field_type: "ReferenceDocument", index: 5}  # → Media
create_schema_field {schema_name: "Post", field_name: "author", field_type: "ReferenceDocument", index: 6}  # → Author
create_schema_field {schema_name: "Post", field_name: "categories", field_type: "ReferenceCollection", index: 7}  # → Category
create_schema_field {schema_name: "Post", field_name: "tags", field_type: "ReferenceCollection", index: 8}  # → Tag
create_schema_field {schema_name: "Post", field_name: "published_at", field_type: "Number", index: 9}  # timestamp
create_schema_field {schema_name: "Post", field_name: "seo_title", field_type: "String", index: 10}
create_schema_field {schema_name: "Post", field_name: "meta_description", field_type: "String", index: 11}
create_schema_field {schema_name: "Post", field_name: "structured_data", field_type: "RichText", index: 12}

# Collections
create_collection {collection_name: "posts", schema_name: "Post"}
create_collection {collection_name: "authors", schema_name: "Author"}
create_collection {collection_name: "categories", schema_name: "Category"}
create_collection {collection_name: "tags", schema_name: "Tag"}
create_collection {collection_name: "media", schema_name: "Media"}
```

### Author Schema
```bash
create_schema_field {schema_name: "Author", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Author", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Author", field_name: "bio", field_type: "RichText", index: 3}
create_schema_field {schema_name: "Author", field_name: "avatar", field_type: "ReferenceDocument", index: 4}  # → Media
create_schema_field {schema_name: "Author", field_name: "social_links", field_type: "RichText", index: 5}  # JSON
```

### Category/Tag Schema
```bash
create_schema_field {schema_name: "Category", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Category", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Category", field_name: "description", field_type: "RichText", index: 3}
create_schema_field {schema_name: "Category", field_name: "parent", field_type: "ReferenceDocument", index: 4}  # self-ref for hierarchy
```

---

## Pattern 2: E-commerce Product

```bash
# Schema: Product
create_schema_field {schema_name: "Product", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Product", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Product", field_name: "sku", field_type: "String", index: 3}
create_schema_field {schema_name: "Product", field_name: "short_description", field_type: "String", index: 4}
create_schema_field {schema_name: "Product", field_name: "description", field_type: "RichText", index: 5}
create_schema_field {schema_name: "Product", field_name: "price", field_type: "Number", index: 6}
create_schema_field {schema_name: "Product", field_name: "compare_at_price", field_type: "Number", index: 7}
create_schema_field {schema_name: "Product", field_name: "cost_price", field_type: "Number", index: 8}
create_schema_field {schema_name: "Product", field_name: "images", field_type: "ReferenceCollection", index: 9}  # → Media
create_schema_field {schema_name: "Product", field_name: "category", field_type: "ReferenceDocument", index: 10}  # → Category
create_schema_field {schema_name: "Product", field_name: "brand", field_type: "ReferenceDocument", index: 11}  # → Brand
create_schema_field {schema_name: "Product", field_name: "variants", field_type: "ReferenceCollection", index: 12}  # → Variant
create_schema_field {schema_name: "Product", field_name: "inventory", field_type: "Number", index: 13}
create_schema_field {schema_name: "Product", field_name: "status", field_type: "String", index: 14}  # draft, active, archived
create_schema_field {schema_name: "Product", field_name: "seo_title", field_type: "String", index: 15}
create_schema_field {schema_name: "Product", field_name: "meta_description", field_type: "String", index: 16}
create_schema_field {schema_name: "Product", field_name: "structured_data", field_type: "RichText", index: 17}
```

### Variant Schema
```bash
create_schema_field {schema_name: "Variant", field_name: "sku", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Variant", field_name: "options", field_type: "RichText", index: 2}  # JSON: {"size": "M", "color": "Red"}
create_schema_field {schema_name: "Variant", field_name: "price", field_type: "Number", index: 3}
create_schema_field {schema_name: "Variant", field_name: "inventory", field_type: "Number", index: 4}
create_schema_field {schema_name: "Variant", field_name: "image", field_type: "ReferenceDocument", index: 5}  # → Media
```

---

## Pattern 3: Documentation/Knowledge Base

```bash
# Schema: DocPage
create_schema_field {schema_name: "DocPage", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "DocPage", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "DocPage", field_name: "summary", field_type: "String", index: 3}
create_schema_field {schema_name: "DocPage", field_name: "body", field_type: "RichText", index: 4}
create_schema_field {schema_name: "DocPage", field_name: "category", field_type: "ReferenceDocument", index: 5}  # → DocCategory
create_schema_field {schema_name: "DocPage", field_name: "tags", field_type: "ReferenceCollection", index: 6}  # → Tag
create_schema_field {schema_name: "DocPage", field_name: "version", field_type: "String", index: 7}
create_schema_field {schema_name: "DocPage", field_name: "last_reviewed", field_type: "Number", index: 8}
create_schema_field {schema_name: "DocPage", field_name: "author", field_type: "ReferenceDocument", index: 9}  # → Author
create_schema_field {schema_name: "DocPage", field_name: "toc_depth", field_type: "Number", index: 10, default: 3}
```

### DocCategory Schema (Hierarchical)
```bash
create_schema_field {schema_name: "DocCategory", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "DocCategory", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "DocCategory", field_name: "description", field_type: "RichText", index: 3}
create_schema_field {schema_name: "DocCategory", field_name: "parent", field_type: "ReferenceDocument", index: 4}  # self-ref
create_schema_field {schema_name: "DocCategory", field_name: "order", field_type: "Number", index: 5}
create_schema_field {schema_name: "DocCategory", field_name: "icon", field_type: "String", index: 6}
```

---

## Pattern 4: Portfolio/Case Study

```bash
# Schema: Project
create_schema_field {schema_name: "Project", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Project", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Project", field_name: "tagline", field_type: "String", index: 3}
create_schema_field {schema_name: "Project", field_name: "overview", field_type: "RichText", index: 4}
create_schema_field {schema_name: "Project", field_name: "challenge", field_type: "RichText", index: 5}
create_schema_field {schema_name: "Project", field_name: "solution", field_type: "RichText", index: 6}
create_schema_field {schema_name: "Project", field_name: "results", field_type: "RichText", index: 7}
create_schema_field {schema_name: "Project", field_name: "hero_image", field_type: "ReferenceDocument", index: 8}  # → Media
create_schema_field {schema_name: "Project", field_name: "gallery", field_type: "ReferenceCollection", index: 9}  # → Media
create_schema_field {schema_name: "Project", field_name: "technologies", field_type: "ReferenceCollection", index: 10}  # → Technology
create_schema_field {schema_name: "Project", field_name: "role", field_type: "String", index: 11}
create_schema_field {schema_name: "Project", field_name: "duration", field_type: "String", index: 12}
create_schema_field {schema_name: "Project", field_name: "client", field_type: "String", index: 13}
create_schema_field {schema_name: "Project", field_name: "link", field_type: "String", index: 14}
create_schema_field {schema_name: "Project", field_name: "github", field_type: "String", index: 15}
create_schema_field {schema_name: "Project", field_name: "featured", field_type: "Boolean", index: 16, default: false}
create_schema_field {schema_name: "Project", field_name: "order", field_type: "Number", index: 17}
```

---

## Pattern 5: Event/Calendar

```bash
# Schema: Event
create_schema_field {schema_name: "Event", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Event", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Event", field_name: "description", field_type: "RichText", index: 3}
create_schema_field {schema_name: "Event", field_name: "start_date", field_type: "Number", index: 4}  # timestamp
create_schema_field {schema_name: "Event", field_name: "end_date", field_type: "Number", index: 5}
create_schema_field {schema_name: "Event", field_name: "timezone", field_type: "String", index: 6, default: "UTC"}
create_schema_field {schema_name: "Event", field_name: "location", field_type: "String", index: 7}
create_schema_field {schema_name: "Event", field_name: "venue", field_type: "ReferenceDocument", index: 8}  # → Venue
create_schema_field {schema_name: "Event", field_name: "organizer", field_type: "ReferenceDocument", index: 9}  # → Organizer
create_schema_field {schema_name: "Event", field_name: "category", field_type: "ReferenceDocument", index: 10}  # → EventCategory
create_schema_field {schema_name: "Event", field_name: "capacity", field_type: "Number", index: 11}
create_schema_field {schema_name: "Event", field_name: "price", field_type: "Number", index: 12}
create_schema_field {schema_name: "Event", field_name: "registration_url", field_type: "String", index: 13}
create_schema_field {schema_name: "Event", field_name: "is_virtual", field_type: "Boolean", index: 14, default: false}
create_schema_field {schema_name: "Event", field_name: "virtual_link", field_type: "String", index: 15}
create_schema_field {schema_name: "Event", field_name: "image", field_type: "ReferenceDocument", index: 16}  # → Media
create_schema_field {schema_name: "Event", field_name: "status", field_type: "String", index: 17}  # draft, published, cancelled, completed
```

---

## Pattern 6: Team/People Directory

```bash
# Schema: Person
create_schema_field {schema_name: "Person", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Person", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Person", field_name: "title", field_type: "String", index: 3}
create_schema_field {schema_name: "Person", field_name: "department", field_type: "ReferenceDocument", index: 4}  # → Department
create_schema_field {schema_name: "Person", field_name: "bio", field_type: "RichText", index: 5}
create_schema_field {schema_name: "Person", field_name: "avatar", field_type: "ReferenceDocument", index: 6}  # → Media
create_schema_field {schema_name: "Person", field_name: "email", field_type: "String", index: 7}
create_schema_field {schema_name: "Person", field_name: "phone", field_type: "String", index: 8}
create_schema_field {schema_name: "Person", field_name: "social", field_type: "RichText", index: 9}  # JSON
create_schema_field {schema_name: "Person", field_name: "skills", field_type: "ReferenceCollection", index: 10}  # → Skill
create_schema_field {schema_name: "Person", field_name: "order", field_type: "Number", index: 11}
create_schema_field {schema_name: "Person", field_name: "is_leadership", field_type: "Boolean", index: 12, default: false}
```

---

## Pattern 7: FAQ/Knowledge Base

```bash
# Schema: FAQ
create_schema_field {schema_name: "FAQ", field_name: "question", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "FAQ", field_name: "answer", field_type: "RichText", index: 2}
create_schema_field {schema_name: "FAQ", field_name: "category", field_type: "ReferenceDocument", index: 3}  # → FAQCategory
create_schema_field {schema_name: "FAQ", field_name: "tags", field_type: "ReferenceCollection", index: 4}
create_schema_field {schema_name: "FAQ", field_name: "order", field_type: "Number", index: 5}
create_schema_field {schema_name: "FAQ", field_name: "structured_data", field_type: "RichText", index: 6}  # FAQPage JSON-LD
```

---

## Anti-Patterns to Avoid

| ❌ Don't | ✅ Do |
|----------|-------|
| Single massive schema with 50+ fields | Split into focused schemas + references |
| Store HTML in String fields | Use RichText for formatted content |
| Duplicate data across documents | Use ReferenceDocument/Collection |
| Hardcode enum values in String | Create reference collection for enum |
| Skip `display_name` | Always set on one field per schema |
| Deep nesting (>3 levels) | Flatten or use RTDB for complex trees |

---

## Deploy Pattern via MCP

```bash
# Save pattern as RTDB template
rtdb_set {path: "schema-templates/blog", value: {...pattern object...}}

# Apply template
# 1. rtdb_get {path: "schema-templates/blog"}
# 2. For each field: create_schema_field
# 3. create_collection
```