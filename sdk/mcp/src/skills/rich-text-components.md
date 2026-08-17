# Rich Text Components Skill

## Purpose
Create, manage, and render reusable rich text components in the CMS.

---

## Component Architecture

```
RichText Field
├── Paragraphs, Headings, Lists (native)
├── Inline: Bold, Italic, Links, Code
└── Blocks: Components (custom)
    ├── Image
    ├── Video
    ├── Callout
    ├── CodeBlock
    ├── Table
    ├── Embed (Twitter, YouTube, etc.)
    ├── Accordion
    ├── Tabs
    └── Custom (your own)
```

---

## Component Registry (RTDB)

```bash
# Define available components
rtdb_set {path: "richtext/components", value: {
  "image": {
    "name": "Image",
    "icon": "image",
    "fields": [
      {"name": "src", "type": "ReferenceDocument", "collection": "media", "required": true},
      {"name": "alt", "type": "String", "required": true},
      {"name": "caption", "type": "String"},
      {"name": "width", "type": "Number"},
      {"name": "alignment", "type": "String", "enum": ["left", "center", "right", "full"]}
    ],
    "render": "ImageComponent"
  },
  "callout": {
    "name": "Callout",
    "icon": "megaphone",
    "fields": [
      {"name": "type", "type": "String", "enum": ["info", "warning", "success", "danger"], "default": "info"},
      {"name": "title", "type": "String"},
      {"name": "content", "type": "RichText", "required": true}
    ],
    "render": "CalloutComponent"
  },
  "codeblock": {
    "name": "Code Block",
    "icon": "code",
    "fields": [
      {"name": "language", "type": "String", "default": "typescript"},
      {"name": "code", "type": "String", "required": true},
      {"name": "filename", "type": "String"},
      {"name": "highlight_lines", "type": "String"}
    ],
    "render": "CodeBlockComponent"
  },
  "embed": {
    "name": "Embed",
    "icon": "link",
    "fields": [
      {"name": "url", "type": "String", "required": true},
      {"name": "caption", "type": "String"}
    ],
    "render": "EmbedComponent"
  },
  "accordion": {
    "name": "Accordion",
    "icon": "chevron-down",
    "fields": [
      {"name": "items", "type": "Array", "items": {
        "type": "Object",
        "fields": [
          {"name": "title", "type": "String", "required": true},
          {"name": "content", "type": "RichText", "required": true}
        ]
      }}
    ],
    "render": "AccordionComponent"
  }
}}
```

---

## Creating Content with Components

### Via MCP (JSON Structure)
```bash
create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {
  title: "Getting Started",
  body: {
    "type": "doc",
    "content": [
      {"type": "paragraph", "content": [{"type": "text", "text": "Welcome to our guide!"}]},
      {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Step 1: Install"}]},
      {"type": "codeblock", "attrs": {"language": "bash", "code": "npm install dashtro"}},
      {"type": "callout", "attrs": {"type": "tip", "title": "Pro Tip", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Use --save-dev for dev dependencies"}]}]}},
      {"type": "image", "attrs": {"src": "media-123", "alt": "Dashboard screenshot", "caption": "Fig 1: Main dashboard"}}
    ]
  }
}}
```

---

## Component Field Types

| Type | Use For | Example |
|------|---------|---------|
| `ReferenceDocument` | Link to media/posts | `src: "media-123"` |
| `String` | Text, URLs, enums | `alt: "Screenshot"` |
| `Number` | Dimensions, order | `width: 800` |
| `Boolean` | Flags | `lazy_load: true` |
| `RichText` | Nested content | `content: {...}` |
| `Array` | Repeating items | `items: [...]` |
| `Object` | Nested config | `settings: {...}` |

---

## Rendering Components (Frontend)

```typescript
// Component map
const components = {
  image: ImageComponent,
  callout: CalloutComponent,
  codeblock: CodeBlockComponent,
  embed: EmbedComponent,
  accordion: AccordionComponent,
  // ...
};

// Render function
function renderRichText(doc, components) {
  return doc.body.content.map(node => {
    if (node.type in components) {
      return <components[node.type] {...node.attrs} />;
    }
    // Native nodes (paragraph, heading, list, etc.)
    return renderNativeNode(node);
  });
}

// Example components
function ImageComponent({ src, alt, caption, alignment }) {
  const media = useMedia(src); // Fetch from media collection
  return (
    <figure className={`image-${alignment}`}>
      <img src={media.url} alt={alt} loading="lazy" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function CalloutComponent({ type, title, content }) {
  return (
    <aside className={`callout callout-${type}`}>
      {title && <h4>{title}</h4>}
      <RichTextRenderer content={content} />
    </aside>
  );
}

function CodeBlockComponent({ language, code, filename, highlight_lines }) {
  const highlighted = highlight(code, language, highlight_lines);
  return (
    <figure className="code-block">
      {filename && <figcaption>{filename}</figcaption>}
      <pre><code className={`language-${language}`}>{highlighted}</code></pre>
    </figure>
  );
}

function EmbedComponent({ url, caption }) {
  const [html, setHtml] = useState(null);
  useEffect(() => {
    fetchOEmbed(url).then(setHtml); // or use iframely, noembed, etc.
  }, [url]);
  return html ? <div className="embed">{html}</div> : <div>Loading...</div>;
}
```

---

## Component Configuration (Per Workspace/Project)

```bash
# Project-level component config
rtdb_set {path: "richtext/config", value: {
  enabled_components: ["image", "callout", "codeblock", "embed", "accordion"],
  default_image_alignment: "center",
  code_theme: "github-dark",
  embed_providers: ["youtube", "twitter", "vimeo", "github", "figma"],
  max_image_width: 1200,
  image_quality: 80
}}

# Workspace override
rtdb_set {path: "richtext/config/staging", value: {
  enabled_components: ["image", "callout", "codeblock", "embed", "accordion", "table", "tabs"],
  // ... staging can have more components for testing
}}
```

---

## Adding Custom Components

### 1. Define in Registry
```bash
rtdb_update {path: "richtext/components", value: {
  "pricing-table": {
    "name": "Pricing Table",
    "icon": "tag",
    "fields": [
      {"name": "plans", "type": "Array", "items": {
        "type": "Object",
        "fields": [
          {"name": "name", "type": "String", "required": true},
          {"name": "price", "type": "Number", "required": true},
          {"name": "period", "type": "String", "default": "month"},
          {"name": "features", "type": "Array", "items": {"type": "String"}},
          {"name": "cta_text", "type": "String"},
          {"name": "cta_link", "type": "String"},
          {"name": "highlighted", "type": "Boolean"}
        ]
      }}
    ],
    "render": "PricingTableComponent"
  }
}}
```

### 2. Create Frontend Component
```tsx
function PricingTableComponent({ plans }) {
  return (
    <table className="pricing-table">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Price</th>
          <th>Features</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {plans.map((plan, i) => (
          <tr key={i} className={plan.highlighted ? "highlighted" : ""}>
            <td>{plan.name}</td>
            <td>
              <span className="price">${plan.price}</span>
              <span className="period">/{plan.period}</span>
            </td>
            <td>
              <ul>{plan.features.map(f => <li key={f}>{f}</li>)}</ul>
            </td>
            <td>
              <a href={plan.cta_link} className="btn">{plan.cta_text}</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 3. Register in Editor
```typescript
// In your rich text editor config
import { PricingTableComponent } from "./components/PricingTable";

const editorComponents = {
  ...defaultComponents,
  "pricing-table": PricingTableComponent,
};
```

---

## Component Versioning

```bash
# Track component versions
rtdb_set {path: "richtext/versions/image", value: {
  current: "2.1.0",
  history: [
    {"version": "2.1.0", "date": "2026-08-16", "changes": "Added lazy loading"},
    {"version": "2.0.0", "date": "2026-07-01", "changes": "Refactored to use media collection"},
    {"version": "1.0.0", "date": "2026-05-01", "changes": "Initial release"}
  ]
}}

# Migration helper
async function migrate_component_data(old_version, new_version, data) {
  if (old_version < "2.0.0" && new_version >= "2.0.0") {
    // Migrate inline image URLs to media references
    data.src = await upload_to_media_collection(data.src);
  }
  return data;
}
```

---

## Validation

```bash
# Component validation rules
rtdb_set {path: "richtext/validation", value: {
  "image": {
    "required_fields": ["src", "alt"],
    "max_file_size": 5242880,  // 5MB
    "allowed_types": ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
  },
  "codeblock": {
    "max_lines": 200,
    "allowed_languages": ["typescript", "javascript", "python", "go", "rust", "bash", "json", "yaml"]
  },
  "embed": {
    "allowed_domains": ["youtube.com", "vimeo.com", "twitter.com", "github.com", "figma.com"]
  }
}}
```

---

## Best Practices

1. **Keep components simple** — single responsibility
2. **Use ReferenceDocument for media** — not inline URLs
3. **Version components** — track changes, migrate data
4. **Validate on save** — prevent invalid component data
5. **Preview in editor** — WYSIWYG for content authors
6. **Document props** — TypeScript interfaces for each component
7. **Test rendering** — SSR/CSR consistency
8. **Accessibility** — semantic HTML, ARIA labels