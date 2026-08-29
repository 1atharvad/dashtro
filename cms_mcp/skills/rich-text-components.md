# Rich Text Components Skill

## Purpose
Create, manage, and structure rich text content with reusable components and consistent formatting.

---

## Rich Text Structure

A RichText field can contain:

**Native elements:**
- Paragraphs, headings (H1–H6), lists (ordered/unordered)
- Inline formatting: bold, italic, underline, strikethrough
- Links (internal, external)
- Code spans

**Block components:**
- Images (with alt text, captions)
- Videos
- Code blocks (with language highlighting)
- Tables
- Quotes/blockquotes
- Callouts (info, warning, success, error)
- Tabs/accordions
- Custom components (your own)

---

## Component Types

### Simple Components
- **Image**: Reference to media document + alt text + caption
- **Quote**: Text + attribution
- **Code Block**: Language + code + line numbers

### Complex Components
- **Table**: Headers + rows + cell data
- **Accordion**: Multiple sections (title + content pairs)
- **Tabs**: Multiple panels (label + content pairs)
- **Callout**: Type (info/warning/success/error) + title + body

### Custom Components
Define your own in RTDB:
- Name, icon, fields
- Field types: String, Number, Boolean, ReferenceDocument
- Render template (for frontend display)

---

## Storing Component Definitions in RTDB

Store a registry of available components so agents know what's possible:

Path: `richtext/components`

For each component, define:
- `name`: Display name
- `icon`: UI icon identifier
- `fields`: Array of field definitions
  - Each field: name, type, required, default value
- `render_template`: How the frontend should display it
- `validation`: Rules (e.g., image max width, code block max lines)

Example structure:
```
richtext/components/image:
  name: "Image"
  icon: "image"
  fields:
    - {name: "src", type: "ReferenceDocument", required: true}
    - {name: "alt", type: "String", required: true}
    - {name: "caption", type: "String"}
    - {name: "width", type: "Number", default: "100%"}

richtext/components/callout:
  name: "Callout"
  icon: "megaphone"
  fields:
    - {name: "type", type: "String", enum: ["info", "warning", "success", "error"]}
    - {name: "title", type: "String"}
    - {name: "message", type: "String"}
```

---

## Using Components in Documents

When storing rich text in a document, embed component data inline:

In RichText field:
```
This is a paragraph.

[COMPONENT: image]
{
  "src": "media-doc-123",
  "alt": "An example image",
  "caption": "This is a caption",
  "width": "800px"
}

This is another paragraph.

[COMPONENT: callout]
{
  "type": "warning",
  "title": "Watch out",
  "message": "This is important"
}
```

Or in structured JSON format (if your RichText supports it):
```json
[
  {"type": "paragraph", "text": "This is a paragraph."},
  {
    "type": "component",
    "name": "image",
    "props": {"src": "media-123", "alt": "...", "caption": "..."}
  }
]
```

---

## Component Validation

Before storing, validate each component:

1. **Type check**: Component name exists in registry
2. **Field validation**: All required fields present
3. **Type validation**: String fields are strings, Number fields are numbers
4. **Reference validation**: ReferenceDocument fields point to valid documents
5. **Enum validation**: Enum fields match allowed values

Validation can happen:
- In MCP server (on `create_document` / `update_document`)
- In frontend (on editing)
- Both (defensive approach)

---

## Component Reusability Patterns

### Shared Components Library
Store commonly-used component configurations in RTDB:
- Path: `richtext/templates/{component_name}/{template_name}`
- Example: callout template for "important note", "warning box", etc.

### Component Versioning
If component schema changes over time:
- Store version in component: `{type: "image", version: 2, ...}`
- Provide migration logic when loading old components

### Disabled Components
Mark components as disabled in registry if no longer used:
- Old code blocks → migrate to new code highlighting
- Old callout style → migrate to new design

---

## Querying Content with Components

**List all images in a document:**
- Parse RichText field
- Find all `[COMPONENT: image]` blocks
- Extract `src` references

**Find all documents using a specific component:**
- List all documents
- For each, scan RichText fields for component usage
- Report which documents use which components

**Find broken component references:**
- Extract all ReferenceDocument values from components
- Check if referenced documents still exist
- Flag broken links

---

## Common Rich Text Scenarios

| Scenario | Implementation |
|----------|-----------------|
| Blog post with mixed media | Use Image components for figures + Code blocks for code samples |
| Tabbed documentation | Use Tabs component with multiple code examples |
| Warning/Info boxes | Use Callout components with type field |
| Embedded videos | Store in Video component (ReferenceDocument to media) |
| Code snippets with syntax highlight | Use Code Block component with language field |
| Dynamic data (charts, metrics) | Custom component that references data document |

---

## Frontend Rendering

Frontend must know how to render each component:

1. Parse RichText field
2. For each component, look up its `render_template` in RTDB
3. Pass component props to template
4. Render with proper styling/behavior

---

## Guidelines for Designing Custom Components

**Keep components focused:**
- One responsibility (e.g., "display an image" not "display image + text + metadata")

**Support responsive design:**
- Width/height fields should accept responsive units (%, em, pixels)
- Don't hardcode dimensions

**Validate rigorously:**
- Required fields: always present
- Optional fields: sensible defaults
- References: verify targets exist

**Document for agents:**
- Clear component purpose
- Which fields are required
- What values each field accepts
- Examples in registry

