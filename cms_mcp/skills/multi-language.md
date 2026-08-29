# Multi-Language / i18n Skill

## Purpose
Manage translated content across multiple languages using MCP.

---

## Strategy Options

| Approach | Best For | Pros | Cons |
|----------|----------|------|------|
| **Separate collections per locale** | Few locales (≤5), different content schedules | Simple queries, isolated workflows, easy to version | Duplicate schemas, manual sync effort |
| **Single collection + locale field** | Many locales (5+), same content structure | Single schema, easy filtering, centralized | Larger documents, complex RTDB tracking |
| **Translation documents** | Professional translation workflows | Clear ownership, versioning, editorial control | Complex queries, more setup |

---

## Option 1: Separate Collections (Recommended for ≤5 locales)

### Setup
1. Create one shared schema (e.g., "Post")
2. Add optional `locale` field to document data for reference
3. Create separate collections for each language:
   - `posts_en` (English)
   - `posts_es` (Spanish)
   - `posts_fr` (French)
   - `posts_de` (German)
   - etc.

### Linking Translations
Add a `translations` field (ReferenceCollection) to the schema. When creating a document in one locale, reference its translations in other locales:
- English post references Spanish, French, German translations
- Spanish post references back to English, French, German

This allows navigation between language versions.

### Querying by Locale
`list_documents` from the locale-specific collection (e.g., `posts_en`) to get English content only.

**Pros**: Simple queries, each collection is independent
**Cons**: Must keep translation references in sync manually

---

## Option 2: Single Collection + Locale Field

### Setup
1. Create schema with a `locale` field (String)
2. One collection (e.g., `posts`) contains all language versions
3. Add filter when querying: `list_documents` then filter where `locale == "en"`

### Document Structure
Each document has a `locale` field indicating its language. You can also add:
- `is_translated: true/false` (whether it's an original or translation)
- `source_document_id` (reference to original if translation)

### Querying
Filter by locale in-memory after `list_documents`, or store locale-filtered views in RTDB.

**Pros**: Single schema, centralized data
**Cons**: Larger documents, filtering complexity

---

## Option 3: Translation Documents

### Setup
1. Create "Source" schema (original language content)
2. Create "Translation" schema (metadata about each translation)
3. Documents in source collection link to translation documents

Each source document has many translation documents, each tracking:
- Language
- Translated content
- Translator
- Last reviewed
- Version

### Workflow
1. Create source document in English
2. For each language, create a translation document that references the source
3. Translation document holds translated fields + metadata

**Pros**: Clear ownership, version control, editorial tracking
**Cons**: More complex queries, requires reference navigation

---

## Common Patterns

### Content Synchronization
If locales share common fields (like images, references):
- Store shared assets in a separate collection
- Reference from locale documents
- Update once, applies to all languages

### Missing Translations
Flag documents that exist in one locale but not others:
- List all docs in locale A
- For each, check if translation reference exists in locale B
- Report gaps

### Translation Status
Track translation progress in RTDB:
- Path: `i18n/translation-status/{document_id}`
- Fields: source_locale, target_locales, completion_percentage, translator, deadline

### Locale Fallback
If a translation is missing, show the original language:
- Query default locale (e.g., English) as fallback
- Implement in frontend, not CMS

---

## Timezone & Date Handling

Timestamps should be independent of locale:
- Store all dates/times as unix timestamps (Number field)
- Frontend converts to user's timezone
- Don't store locale-specific date formats in CMS

---

## Common i18n Scenarios

| Scenario | Implementation |
|----------|-----------------|
| Blog in 3 languages | Separate collections (`posts_en`, `posts_es`, `posts_fr`), with translation references |
| Product catalog, 10 markets | Single collection with locale field, filter by locale in queries |
| Legal documents, precise versioning | Translation schema with ownership tracking |
| Help center, missing translations | List all articles, check translation refs, report gaps |
| Auto-publish across locales | Schedule each locale version separately using scheduling queue |

---

## Multilingual Search & Discovery

If implementing search:
- Index by locale (separate search indices per language)
- Or add language suffix to search field names
- Clients query the right language index

---

## Workflow for Agencies

For teams managing translations:

1. **Source is created** in default language (English)
2. **Translation request created** in RTDB: `i18n/requests/{request_id}`
3. **Translator picks up** request, creates translated documents
4. **Review & QA** validates translations
5. **Publish** translated version alongside original
6. **Track status** in RTDB for reporting

