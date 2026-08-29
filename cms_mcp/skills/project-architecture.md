# Project Architecture Skill

## Purpose
Understand the CMS hierarchy and create projects, workspaces, collections, and documents in the correct order.

---

## Hierarchy Overview

The CMS organizes content in layers:

```
Project (top-level container)
  └── Workspace (logical grouping within project)
      └── Schema (field definitions, auto-created on first field)
          └── Collection (container for documents using that schema)
              └── Document (individual content item)
```

---

## Creation Order (Critical — do this exactly)

1. **Project** (`create_project`)
   - Standalone. No dependencies.
   - Returns `project_id`.
   - Top-level container for all workspaces.

2. **Workspace** (`create_workspace`)
   - Requires `project_id` from step 1.
   - Groups schemas, collections, documents logically.
   - Example: separate workspaces for "production", "staging", "drafts".
   - Returns `workspace_id` (rarely needed; most tools accept `project_id` implicitly).

3. **Schema** (via `create_schema_field`)
   - Define fields using `create_schema_field` — see `schema-design-patterns.md` for field naming, types, and design rules.
   - Schema is created on first field definition, doesn't exist until then.

4. **Collection** (`create_collection`)
   - Requires both `schema_name` (from step 3) and `collection_name` (you define it).
   - One collection per schema (or reuse a schema across multiple collections if needed).
   - Example: schema "Post" could have collections "blog_posts" and "news_posts".
   - Returns `collection_id`.

5. **Document** (`create_document`)
   - Requires `collection_name` (from step 4).
   - Provide `data` dict with field values matching the schema's fields.
   - **All fields are optional in the `data` dict** (defaults/nulls are OK).

---

## Decision Tree for Agents

**When a user asks to "create content", follow this:**

1. **Do I have a `project_id`?**
   - No → `create_project {name: "...", description: "..."}`
   - Yes → Continue to step 2.

2. **Do I have a `workspace_name`?**
   - No → Use default workspace (ask user, or use project default)
   - Yes → Continue to step 3.

3. **Does the schema already exist?**
   - No → Define it via `create_schema_field` for each field
   - Yes → Continue to step 4.

4. **Does the collection already exist?**
   - No → `create_collection {schema_name: "...", collection_name: "..."}`
   - Yes → Continue to step 5.

5. **Create the document**: `create_document {collection_name: "...", data: {...}}`

---

## Minimal Working Example

**Blog system setup (showing correct sequence):**

```
# 1. Create Project
create_project {name: "My Blog", description: "Blog platform"}
# Returns project_id (use in subsequent steps)

# 2. Create Workspace (optional, uses project default if omitted)
create_workspace {project_id: "...", name: "production"}

# 3. Define Schema: Author (implicitly created on first field)
create_schema_field {schema_name: "Author", field_name: "name", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Author", field_name: "email", field_type: "String", index: 2}

# 4. Define Schema: Post (implicitly created on first field)
create_schema_field {schema_name: "Post", field_name: "title", field_type: "String", index: 1, display_name: true}
create_schema_field {schema_name: "Post", field_name: "body", field_type: "RichText", index: 2}
create_schema_field {schema_name: "Post", field_name: "author", field_type: "ReferenceDocument", index: 3}
create_schema_field {schema_name: "Post", field_name: "published_at", field_type: "Number", index: 4}

# 5. Create Collections
create_collection {schema_name: "Author", collection_name: "authors"}
create_collection {schema_name: "Post", collection_name: "posts"}

# 6. Create Documents
create_document {collection_name: "authors", data: {name: "Jane Doe", email: "jane@example.com"}}
create_document {collection_name: "posts", data: {title: "Hello World", body: "...", author: "author_id", published_at: 1692374400000}}
```

---

## Common Mistakes

| ❌ Mistake | ✅ Correct | Why |
|-----------|-----------|-----|
| Call `create_schema` directly | Use `create_schema_field` (schema auto-created on first field) | Schema doesn't exist as a separate entity |
| Omit `schema_name` when creating collection | Always provide `schema_name` to `create_collection` | Collection must know which schema's fields to validate |
| Use empty `project_id` or `workspace_name` | Always provide explicit values or rely on env var `CMS_PROJECT_ID` | Empty strings are rejected; no implicit fallbacks |
| Create a document before the collection exists | Always create collection first, then documents | Documents require `collection_name`; collection must exist first |
| Mix workspaces (put documents from different workspaces in same collection) | Keep collection members in one workspace | Collections are workspace-scoped |

---

## Workspace Strategies

**Single workspace per project** (simple)
- All content in one workspace.
- Use collection names to organize (e.g., `posts_en`, `posts_es`).

**Separate workspaces by stage** (recommended for publishing workflows)
- `staging`: Draft content, testing
- `production`: Live content
- `archive`: Old/retired content

**Separate workspaces by team** (for large organizations)
- Marketing team workspace
- Engineering team workspace
- Legal team workspace

---

## Querying the Hierarchy

**List all projects** (if multiple projects exist):
- `list_projects`

**List all workspaces in a project**:
- `list_workspaces {project_id: "..."}`

**List all schemas** (defined by the fields you've created):
- `list_schemas {project_id: "..."}`

**List all collections in a schema**:
- `list_collections {schema_name: "..."}`

**List all documents in a collection**:
- `list_documents {collection_name: "...", workspace_name: "..."}`
