# Multi-Language / i18n Skill

## Purpose
Manage translated content across multiple languages using MCP.

---

## Strategy Options

| Approach | Best For | Pros | Cons |
|----------|----------|------|------|
| **Separate collections per locale** | Few locales, different content | Simple queries, isolated workflows | Duplicate schema, sync effort |
| **Single collection, locale field** | Many locales, same structure | Single schema, easy filtering | Large documents, complex RTDB |
| **Translation documents** | Professional translation workflow | Clear ownership, versioning | More complex queries |

---

## Option 1: Separate Collections (Recommended for ≤5 locales)

### Schema (Shared)
```bash
# Create once, reference from each locale collection
create_schema_field {schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Post", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Post", field_name: "body", field_type: "RichText", index: 3}
create_schema_field {schema_name: "Post", field_name: "locale", field_type: "String", index: 4}  # For reference
# ... SEO fields, references, etc.
```

### Collections per Locale
```bash
create_collection {collection_name: "posts_en", schema_name: "Post"}
create_collection {collection_name: "posts_es", schema_name: "Post"}
create_collection {collection_name: "posts_fr", schema_name: "Post"}
create_collection {collection_name: "posts_de", schema_name: "Post"}
```

### Linking Translations
```bash
# Add translation reference field
create_schema_field {schema_name: "Post", field_name: "translations", field_type: "ReferenceCollection", index: 20}

# When creating EN post:
create_document {collection_name: "posts_en", data: {title: "Hello", locale: "en", translations: ["posts_es:doc-123", "posts_fr:doc-456"]}}

# When creating ES translation:
create_document {collection_name: "posts_es", data: {title: "Hola", locale: "es", translations: ["posts_en:doc-789"]}}
```

### Query by Locale
```bash
# Get English posts
list_documents {workspace_name: "production", collection_name: "posts_en", minimal: true}

# Get all locales for a slug (client-side join)
# 1. list_documents {collection_name: "posts_en"} → find by slug
# 2. Read translations array
# 3. Fetch each translation
```

---

## Option 2: Single Collection with Locale Field

### Schema
```bash
create_schema_field {schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Post", field_name: "slug", field_type: "String", index: 2}
create_schema_field {schema_name: "Post", field_name: "locale", field_type: "String", index: 3}  # en, es, fr, de
create_schema_field {schema_name: "Post", field_name: "body", field_type: "RichText", index: 4}
create_schema_field {schema_name: "Post", field_name: "translation_group", field_type: "String", index: 5}  # UUID linking translations
```

### Query
```bash
# All English posts
list_documents {collection_name: "posts", minimal: false}
# Filter client-side: where locale == "en"

# All translations of a post
# Filter: translation_group == "uuid-123"
```

---

## Option 3: Translation Documents (Professional Workflow)

### Schemas
```bash
# Source content
create_schema_field {schema_name: "Post", field_name: "title", field_type: "String", index: 1}
create_schema_field {schema_name: "Post", field_name: "body", field_type: "RichText", index: 2}
# ...

# Translation job
create_schema_field {schema_name: "TranslationJob", field_name: "source_doc_id", field_type: "ReferenceDocument", index: 1}
create_schema_field {schema_name: "TranslationJob", field_name: "source_locale", field_type: "String", index: 2}
create_schema_field {schema_name: "TranslationJob", field_name: "target_locale", field_type: "String", index: 3}
create_schema_field {schema_name: "TranslationJob", field_name: "translator", field_type: "ReferenceDocument", index: 4}  # → User
create_schema_field {schema_name: "TranslationJob", field_name: "status", field_type: "String", index: 5}  # pending, in_progress, review, approved
create_schema_field {schema_name: "TranslationJob", field_name: "translated_content", field_type: "RichText", index: 6}
create_schema_field {schema_name: "TranslationJob", field_name: "notes", field_type: "RichText", index: 7}

create_collection {collection_name: "posts", schema_name: "Post"}
create_collection {collection_name: "translation_jobs", schema_name: "TranslationJob"}
```

### Workflow
```bash
# 1. Create source post
create_document {collection_name: "posts", data: {title: "Hello", body: "...", locale: "en"}}

# 2. Create translation jobs
create_document {collection_name: "translation_jobs", data: {
  source_doc_id: "post-123",
  source_locale: "en",
  target_locale: "es",
  status: "pending"
}}
create_document {collection_name: "translation_jobs", data: {
  source_doc_id: "post-123",
  source_locale: "en",
  target_locale: "fr",
  status: "pending"
}}

# 3. Translator picks up job
update_document {document_id: "job-456", data: {status: "in_progress", translator: "user-789"}}

# 4. Translator submits
update_document {document_id: "job-456", data: {
  status: "review",
  translated_content: "Hola...",
  notes: "Translated marketing terms"
}}

# 5. Reviewer approves
update_document {document_id: "job-456", data: {status: "approved"}}

# 6. Auto-create translated post (webhook/worker)
# On approved: create_document {collection_name: "posts", data: {title: "Hola", body: "...", locale: "es", translation_group: "post-123"}}
```

---

## Locale Configuration (RTDB)

```bash
# Supported locales
rtdb_set {path: "i18n/locales", value: [
  {code: "en", name: "English", native: "English", default: true, rtl: false},
  {code: "es", name: "Spanish", native: "Español", default: false, rtl: false},
  {code: "fr", name: "French", native: "Français", default: false, rtl: false},
  {code: "de", name: "German", native: "Deutsch", default: false, rtl: false},
  {code: "ar", name: "Arabic", native: "العربية", default: false, rtl: true},
  {code: "ja", name: "Japanese", native: "日本語", default: false, rtl: false}
]}

# Fallback chain
rtdb_set {path: "i18n/fallback", value: {
  "es": ["en"],
  "fr": ["en"],
  "de": ["en"],
  "ar": ["en"],
  "ja": ["en"]
}}
```

---

## Frontend Integration

```javascript
// Get localized content
async function getLocalizedPost(slug, locale) {
  // Try exact locale
  let posts = await mcp.list_documents({
    collection_name: "posts",
    minimal: false
  });
  let post = posts.find(p => p.slug === slug && p.locale === locale);
  
  // Fallback chain
  if (!post) {
    const fallbacks = (await mcp.rtdb_get("i18n/fallback"))[locale] || ["en"];
    for (const fb of fallbacks) {
      post = posts.find(p => p.slug === slug && p.locale === fb);
      if (post) break;
    }
  }
  
  return post;
}

// Language switcher
function LanguageSwitcher({ currentLocale, slug }) {
  const locales = await mcp.rtdb_get("i18n/locales");
  return (
    <select onChange={e => navigate(`/${e.target.value}/${slug}`)}>
      {locales.map(l => (
        <option key={l.code} value={l.code} selected={l.code === currentLocale}>
          {l.native}
        </option>
      ))}
    </select>
  );
}
```

---

## SEO for Multi-Language

```bash
# Add hreflang to each document
create_schema_field {schema_name: "Post", field_name: "hreflang", field_type: "RichText", index: 30}  // JSON map

# Example hreflang value:
{
  "en": "https://site.com/en/post/hello",
  "es": "https://site.com/es/post/hola",
  "fr": "https://site.com/fr/post/bonjour",
  "x-default": "https://site.com/en/post/hello"
}
```

### Sitemap with hreflang
```xml
<url>
  <loc>https://site.com/en/post/hello</loc>
  <xhtml:link rel="alternate" hreflang="en" href="https://site.com/en/post/hello" />
  <xhtml:link rel="alternate" hreflang="es" href="https://site.com/es/post/hola" />
  <xhtml:link rel="alternate" hreflang="fr" href="https://site.com/fr/post/bonjour" />
  <xhtml:link rel="alternate" hreflang="x-default" href="https://site.com/en/post/hello" />
</url>
```

---

## MCP Bulk Translation Helper

```python
async def create_translation_jobs(project_id, source_doc_id, target_locales):
    """Create translation jobs for all target locales."""
    jobs = []
    for locale in target_locales:
        job = await create_document(
            project_id, "staging", "translation_jobs",
            data={
                "source_doc_id": source_doc_id,
                "source_locale": "en",
                "target_locale": locale,
                "status": "pending"
            }
        )
        jobs.append(job)
    return jobs

async def get_pending_translations(project_id, translator_id):
    """Get jobs assigned to translator."""
    jobs = await list_documents(project_id, "staging", "translation_jobs", minimal=False)
    return [j for j in jobs["document_ids"] 
            if jobs["document_statuses"][j] == "in_progress" 
            and jobs["translator"] == translator_id]
```

---

## Best Practices

1. **Use ISO 639-1 codes** (en, es, fr, de, ja, zh, ar)
2. **Store locale on every document** for easy filtering
3. **Link translations** via `translation_group` or `translations` ref
4. **Fallback chain** in RTDB for missing translations
5. **Separate workflow** for professional translation (Option 3)
6. **RTDB for config** — locales, fallbacks, translators
7. **SEO hreflang** on every localized page