---
name: building-responsive-page
description: Build a new cms-frontend page or component following the repo's established mobile-responsive convention (768px breakpoint, dual desktop/mobile action rendering). Use when adding a new page, toolbar, or action menu to cms-frontend that needs to work on mobile.
---

## Building a responsive cms-frontend page

`cms-frontend` uses a single breakpoint, 768px, via Tailwind utility classes (`hidden`, `md:flex`, `md:inline-flex`, `md:hidden`) for toggling whole elements, plus SCSS `@media (max-width: 767px)` / `(min-width: 768px)` for layout details Tailwind doesn't cover.

### Page-level action buttons: render both, toggle with CSS

Don't conditionally render one variant or the other — render the desktop button/menu and the mobile equivalent side by side, each wrapped to hide on the other breakpoint. This avoids duplicating event handlers.

**Single action** (`ProjectPage.tsx`, `SingleActionMenu` — a page-local helper, not a shared component):
```tsx
<span className="hidden md:inline-flex">
  <Button variant="default" onClick={() => setAddingWs(true)}>
    <Plus className="h-4 w-4" /> Add Workspace
  </Button>
</span>
<span className="md:hidden">
  <SingleActionMenu
    icon={<Plus className="h-4 w-4" />}
    label="Add Workspace"
    onClick={() => setAddingWs(true)}
  />
</span>
```

**Multiple actions** (3-dot dropdown menu, built on advi-ui's `Menu`) — see `SchemaActionsMenu.tsx`, `DocumentActionsMenu.tsx` for the component shape: an `items` array of `{value, label, icon, onSelect, disabled?, destructive?}` plus `{type: 'separator', value}`. Desktop gets inline buttons (or a smaller menu with fewer actions); mobile gets the full action menu:
```tsx
<span className="hidden md:inline-flex">
  <SchemaActionsMenu isLocked={isLocked} onToggleLock={handleToggleLock} onDownload={handleDownload} onDelete={() => setDeleteSchemaOpen(true)} />
</span>
<span className="md:hidden">
  <SchemaActionsMenu onSave={...} onImport={...} ... />
</span>
```

### Sidebar/drawer: always mount both, toggle visibility only

Different sub-pattern from action buttons — `LinkDrawer.tsx` renders advi-ui's `PageAside` (desktop, `hidden md:flex`) and `AsideDrawer` (mobile, `md:hidden`) **always both mounted**, visibility toggled by CSS class only, never conditionally rendered. advi-ui's `Modal` internals don't tolerate being unmounted/remounted across a breakpoint change — don't "optimize" this into a single conditionally-rendered component.

### Gotcha: Tailwind vs. MUI/advi-ui inline `display`

Applying `hidden`/`md:flex` directly to an element that MUI or advi-ui also sets its own `display` on (e.g. a MUI `Grid container`, or advi-ui's `.vi-header-desktop`) is unreliable — both are single-class specificity, so cascade order isn't guaranteed. **Fix:** wrap the library component in a plain `<span>`/`<Box>` and put the Tailwind visibility classes on that wrapper instead, leaving the library component's own `display` untouched. This is why the examples above wrap components in `<span>` rather than passing `className="hidden md:inline-flex"` straight to the library component.

### Checklist

- [ ] Action buttons/menus rendered for both breakpoints, wrapped in `<span>`/`<Box>`, not passed directly to a MUI/advi-ui component's own className
- [ ] Sidebar/drawer-style elements always mounted, visibility CSS-toggled — not conditionally rendered
- [ ] SCSS media queries use `max-width: 767px` / `min-width: 768px` to match the Tailwind breakpoint exactly
