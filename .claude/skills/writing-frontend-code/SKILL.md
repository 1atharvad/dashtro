---
name: writing-frontend-code
description: Write cms-frontend React/TSX code that follows this repo's accessibility (WCAG), color-token, and anti-slop conventions from the start, instead of needing cleanup after. Use when writing or editing any component, page, or style in cms-frontend.
---

## Writing frontend code

### Accessibility — enforced, not just advisory

`eslint-plugin-jsx-a11y` (`recommended` ruleset) is wired into `cms-frontend/eslint.config.js` — it catches missing `alt` text, invalid/missing ARIA, non-interactive elements with click handlers, unlabeled form controls, and similar WCAG-adjacent issues. It won't run automatically (see CLAUDE.md Hard Rules — never self-initiate `npm run lint`); write code that would already pass it:

- Use semantic HTML elements (`<button>`, `<nav>`, `<label>`) over `<div onClick>` — a clickable `div` needs `role="button"`, `tabIndex={0}`, and a keyboard handler to be equivalent, and it's simpler to just use a `<button>`.
- Every `<img>` needs meaningful `alt` (or `alt=""` if purely decorative).
- Every form input needs an associated `<label>` (via `htmlFor`/`id`, or wrapping).
- Icon-only buttons (common in this codebase's action menus — `SchemaActionsMenu`, `DocumentActionsMenu`) need `aria-label`.
- Don't rely on color alone to convey state (e.g. the production/draft status indicators) — pair color with an icon, label, or text.
- If you genuinely can't satisfy a rule for a specific case, ask rather than silently disabling it with an eslint-disable comment.

### Color — use the existing tokens, don't invent new hex values

This repo already has a deliberate, WCAG-contrast-checked color system — reuse it instead of picking a new hex value:

- **MUI theme tokens**: `cms-frontend/src/ts/theme/theme.ts` (`getDesignTokens`) — `text.primary`/`text.secondary`/`text.disabled` were explicitly re-tuned for contrast (see the comments in that file); don't override them with MUI's own defaults or an arbitrary color.
- **SCSS variables**: `cms-frontend/src/scss/global/global-colors.scss` — chrome/teal palette, semantic colors (`$danger`, `$production-green`), and component-specific tokens are all defined there. Check this file before writing a new hex literal into a `.scss` file; if the color you need isn't there, add a named variable to this file rather than inlining a hex value in a component's stylesheet.
- New colors must hold reasonable contrast against their background — this repo targets WCAG AA (~4.5:1 for normal text, ~3:1 for large text/UI components). If unsure, say so rather than guessing.

### Don't produce AI slop

This is the same standard as the rest of the repo (see CLAUDE.md's Behavioral Guidelines and Hard Rules — not restated here):

- No unnecessary abstraction for single-use components, no defensive code for states that can't occur, no unrequested "consistency" refactors of adjacent pages.
- No comments in `.scss` files (Hard Rule) — bare rules only.
- No `!important` / `sx` overrides to fight a shared class's layout — add a scss modifier class (Hard Rule).
- Match the mobile-responsive pattern already established — see the `building-responsive-page` skill.
- Every function/test still needs a short docstring (Hard Rule) — this applies to `.ts`/`.tsx` same as the backend.

### Checklist for new/edited components

- [ ] Semantic elements used where applicable; no bare `<div>`/`<span>` standing in for interactive controls
- [ ] All images have `alt`; all icon-only buttons have `aria-label`; all inputs have a label
- [ ] Colors come from `theme.ts` or `global-colors.scss`, not new inline hex values
- [ ] No SCSS comments, no `sx`+`!important`, no unrequested layout changes to adjacent code
