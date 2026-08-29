# Content Migration Skill

## Purpose
Import, export, and transform content between systems, formats, and CMS instances.

---

## Export from DashTro CMS

### Export Workflow
1. `list_collections` to get all collection names
2. For each collection, `list_documents` to get all document IDs
3. For each document, `get_document` with `minimal: false` and `depth: 5` to get full content with nested references
4. `get_schema` for each schema to export field definitions
5. Write results to a structured format (JSON Lines, CSV, or custom format)

### Export Structure
Export as a portable format that includes:
- Schemas (name, fields, types)
- Collections (name, schema reference)
- Documents (collection, data, status, version)

This allows re-importing into another DashTro instance or transforming for another CMS.

---

## Import to DashTro CMS

### Prerequisites (in order)
1. Ensure target project exists (or `create_project` a new one)
2. Create workspaces with `create_workspace`
3. Define schemas with `create_schema_field` (one field at a time)
4. Create collections with `create_collection`
5. Import documents with `create_document` or `update_document`

### Import Workflow
1. Parse source data (JSON Lines, CSV, API response, etc.)
2. Group by entity type: schemas → collections → documents
3. Create schemas first (must exist before collections)
4. Create collections (must exist before documents)
5. For each document:
   - Resolve reference IDs (map source IDs → new CMS IDs)
   - `create_document` with transformed data
   - If document has a status (draft, published), `update_document_status` after creation
6. Track old ID → new ID mapping for reference remapping in subsequent documents

### ID Mapping Challenge
When importing, document IDs change (old source ID → new CMS-generated ID). Store a mapping so that reference fields in later documents can point to the correct new IDs.

---

## Common Migration Scenarios

### WordPress → DashTro
- WordPress Posts → DashTro collection "posts" (schema "Post")
- WordPress Pages → DashTro collection "pages" (schema "Page")
- WordPress Categories/Tags → ReferenceCollection fields
- WordPress Media Library → Either RTDB or separate "media" collection
- ACF custom fields → DashTro schema fields (map ACF type → field type)

### Contentful → DashTro
- Contentful content types → DashTro schemas
- Contentful entries → DashTro documents
- Contentful field IDs → DashTro field names (map types: Text → String, RichText → RichText, Link → ReferenceDocument)
- Preserve Contentful entry IDs or create new ones in CMS (affects reference mapping)

### Sanity → DashTro
- Sanity document types (`_type`) → DashTro collections
- Sanity documents (`_id`, fields) → DashTro documents
- Sanity references (`_ref`) → DashTro ReferenceDocument/ReferenceCollection (resolve after full import)
- Sanity assets → RTDB or media collection

### Generic Headless CMS
Create a mapping document that defines:
- Which source fields map to which CMS schema fields
- Type transformations (source type → DashTro type)
- How to handle nested/complex fields
- Reference ID remapping logic

---

## Field Type Mapping

| Source Type | DashTro Type | Notes |
|-------------|-------------|-------|
| Text, String | String | |
| Long Text, RichText, HTML | RichText | |
| Number, Integer, Float | Number | |
| Boolean, Checkbox | Boolean | |
| Date, DateTime | Number | Store as unix timestamp |
| Select, Radio | String or ReferenceCollection | If many options, use reference collection |
| Link, Reference | ReferenceDocument or ReferenceCollection | Requires ID remapping after import |
| Asset, File, Image | ReferenceDocument | Point to media collection or RTDB |
| Object, JSON | RichText | Store as JSON string in RichText |

---

## Handling References During Import

1. **First pass**: Import all documents with reference fields set to source IDs (or null)
2. **Build ID map**: Create a mapping of source ID → new CMS ID for every document created
3. **Second pass**: Go back and update all reference fields to point to the correct new CMS IDs

Or, if source system provides IDs:
- Use source IDs as CMS document IDs (if CMS allows custom IDs)
- Reference mapping happens automatically

---

## Data Transformation

Some data may need transformation during import:
- **Dates**: Convert from ISO strings to unix timestamps
- **URLs**: Rewrite relative links if domain changed
- **Rich content**: Convert HTML to markdown or vice versa (if needed)
- **Enums**: Map source enum values to CMS enum/reference values
- **Nested data**: Flatten complex nested structures or create separate documents

---

## Dry Run & Validation

Before importing production data:
1. Set `MCP_READ_ONLY=true` to prevent writes
2. Run the import workflow on a subset (first 10 documents)
3. Verify schema fields match, data types are correct, references are sane
4. Manually inspect a few documents in the CMS
5. Remove `READ_ONLY` and proceed with full import

---

## Rollback Strategy

If import fails midway:
1. Decide: can you resume from where it stopped, or restart?
2. If resume: record last successfully imported document ID, skip to next
3. If restart: delete imported documents and re-import (or use a separate test workspace)
4. Verify: count imported documents, spot-check a few records

---

## Common Import Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| References point to missing documents | ID mapping incomplete or out of order | Import in correct order: schemas → docs with no refs → docs with refs |
| Required fields empty | Schema fields not mapped | Check mapping document, ensure all required source fields are included |
| Data type mismatch | Source data doesn't match DashTro field type | Transform before import (e.g., string → number) |
| Duplicate documents | Accidental re-import | Check CMS for duplicates, deduplicate, or reimport to fresh workspace |

