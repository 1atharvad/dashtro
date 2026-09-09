# CMS Tool — Plan

Active/in-progress work items. Stable design decisions belong in
`ARCHITECTURE.md`, not here — once a section here is fully done, its
lasting facts get migrated there and the checklist is removed from this
file (see git history for anything checked off before this trim: SDK & API
key auth/scoping, and the MCP/SDK "no AI slop" schema+document write
integrity work).

## Frontend: mobile-responsive layout

`cms-frontend`'s admin UI (dashboard, editors, sidebars, etc.) doesn't reflow
for small screens — needs actual CSS/Tailwind breakpoint work across
components, not just a viewport meta tag fix. Not started. Known specifics:

- The aside/sidebar isn't responsive — Advi (design reference) has a
  responsive version already designed, just not implemented.
- Form component boxes (e.g. the schema field boxes) have no responsive
  layout — each input should take the full width on mobile instead of the
  current fixed/side-by-side layout.
- Page-level button options (schema, collections, documents) should collapse
  into a dropdown menu on mobile instead of staying inline.
- Applies to all pages: schema, collections, documents — not just one.

## Frontend: signup/signin error handling

Error messages on the signup and signin pages aren't surfaced properly —
needs a proper popup/toast messaging system instead of the current handling.
Not started.