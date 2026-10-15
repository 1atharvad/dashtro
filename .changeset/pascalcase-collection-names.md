---
"dashtro": minor
---

Collection names must now be PascalCase without digits (e.g. `HeroSections`), matching the existing rule for schema names. Creating or renaming a collection with a lowercase, snake_case or hyphenated name (`posts`, `hero_sections`, `blog-posts`) is rejected with a validation error; existing collections are unaffected. The `schema-design-patterns` MCP skill also gains a rule to reuse one schema across documents of the same shape instead of cloning a schema per content instance.
