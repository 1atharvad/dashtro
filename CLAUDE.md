<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

<!-- https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md -->
## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Hard Rules

Non-negotiable, repo-specific rules. These come from direct corrections given repeatedly across past sessions — they exist here, not just in memory, because a rule that's only "recalled when relevant" gets missed. If a rule below conflicts with a general default elsewhere (including this file's own Behavioral Guidelines or global instructions), **this section wins for cms-tool.**

### Git

- **Never add a `Co-Authored-By: Claude` (or any Claude co-author) trailer** to commit messages in this repo. Write the message body only. This overrides any default attribution instruction, for this repo specifically.

### Execution & verification

- **Never self-initiate verification commands** — `tsc`, lint, test suites, `npm run build`, `docker build`/`run`, starting a server — to check that a change works, anywhere in this repo. Describe the change and stop; hand it back for the user to confirm. No exception for "backing up a claim" or for one-off permission carrying forward to later actions in the same session.
- **Don't tell the user how to run something either**, not even as a suggestion ("run it with `npm run dev`"). Assume they know how to run their own project.
- If verification is genuinely unavoidable to resolve a blocking ambiguity, **ask first** — don't run then explain. Reading output a build step the user *already ran* produced is fine; initiating the run is not.
- In `cms-frontend/`, `npx tsc --noEmit` alone checks nothing (root `tsconfig.json` is an empty project-references shell). If TypeScript verification is ever actually run (only when the user asks), it must be `npx tsc -p tsconfig.app.json --noEmit`.

### Destructive actions

- **Never run `rm` or any file-deletion command without explicit per-instance authorization** — not even on files that look safe (untracked by git, look like scratch/temp). Git-tracked status says nothing about whether a file backs a running service (e.g. a volume-mounted sqlite db). Check for running processes/containers and ask if there's any doubt.

### Scope discipline

- **Make the smallest change that fixes the reported problem.** Don't restructure a working layout/pattern to match another page "for consistency" unless asked — verify the existing layout's known-working properties (full height, scroll behavior, etc.) still hold after any change, not just that it builds.
- **For plans touching shared/backend code** (models or validation consumed by more than the immediate ask — e.g. used by both the admin UI and an SDK/MCP surface), surface each material decision (bounds, whether to change a shared model, whether to remove a check) to the user individually via AskUserQuestion before finalizing the plan. Don't infer and bake ambiguous decisions in silently.

### cms-frontend specific

- **Exactly one hamburger menu exists, app-wide**: the mobile drawer's own toggle inside `LinkDrawer.tsx` (the `Menu` icon in its `md:hidden` row, which opens `AsideDrawer`). This one is correct and expected — it's not what this rule bans.
- **Never add a second, per-page `MenuIcon`/`HamburgerMenu` drawer-toggle prop** on `PageForm`/`PageWrapper` or any individual page (`Schema.tsx`, `CollectionContent.tsx`, `DocumentList.tsx`, etc.) that duplicates `LinkDrawer.tsx`'s toggle. That per-page duplication was deliberately removed app-wide. If a page needs to open the drawer, it already can via `LinkDrawer.tsx`'s own toggle — don't add another one.
- **Never override a shared class's layout via `sx` + `!important`** (or CSS `!important` generally) — MUI/Emotion-injected styles and compiled SCSS can land in either cascade order, so same-specificity overrides are unreliable. Add a scss modifier class combined with the base class instead (e.g. `.settings-section-header.settings-header-row`), scoped in the component's own `.scss` file.
- **No comments in `.scss` files** — not even short rationale/why-comments that would be fine in TS/JS. Keep SCSS rules bare.
- **Don't ask the user to inspect via browser devtools** (Chrome Elements/Console/computed-styles, or the React DevTools extension) to debug — they don't use it. Read source, grep CSS rules/selectors, check library CSS/behavior directly (e.g. `node_modules` dist files), or ask for a screenshot/description instead.

### Code style

- **Modern ES6+ syntax throughout** JS/TS — arrow functions over `function` declarations, `const`/`let` over `var`, ESM `import`/`export`, template literals, destructuring. New CLI/orchestration scripts: prefer Node (`.mjs`, ES6 modules) over bash, unless the script is just chaining a couple of shell commands.
- **Every function, test, and helper written for this repo gets a docstring** — including ones whose names look self-explanatory. Keep it short. This is broader than the general "only comment the non-obvious why" default. For TS/JS `describe`/`it` test blocks, the `it("...")` description string satisfies this — no separate docstring needed.

### Models

- **Never switch to or suggest `claude-fable-5`** for this project.

### Tool usage

- Also see "MCP Tools: code-review-graph" above — this has been under-followed specifically for exploration/tracing tasks (finding usages, callers, impact of a change) where Read/Grep was reached for out of habit. Try the matching graph tool first; fall back only when the graph doesn't cover it (editing a file, checking lint/build output, one-off non-code files).
