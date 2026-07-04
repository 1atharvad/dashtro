# Dashtro Frontend

React + TypeScript + Vite frontend for Dashtro.

## Structure

- `src/ts/pages/` — top-level routed pages (`ProjectPage`, `Schema`,
  `CollectionContent`, `DocumentContent`, `SettingsPage`, `RealtimeDatabase`,
  `RichTextComponentEditor`, `RichTextComponentsList`, `Login`).
- `src/ts/components/` — reusable components, including `fields/` (one
  component per schema field type, registered via `src/ts/config/fieldRegistry.ts`)
  and `settings/` (users, API keys, audit log/heatmap).
- `src/redux/` — Redux Toolkit slices, one per resource (`projectSlice`,
  `workspaceSlice`, `collectionSlice`, `documentSlice`, `schemaSlice`,
  `schemaPresetSlice`, `categorySlice`, `realtimeDbSlice`,
  `richTextComponentSlice`).
- `src/hooks/` — data-fetching hooks wrapping the Redux slices
  (`useProject`, `useWorkspace`, `useCollection`, `useDocument`, `useSchema`,
  `useCurrentUser`, etc).
- `src/ts/context/` — React contexts (`UserContext`, theme's `colorModeContext`).
- `src/ts/theme/` — MUI theme provider and dark/light mode.

## Running

Via the root compose files (recommended — see root [README](../README.md)),
or directly:

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build — production build (also validates types)
npm run lint
```

## Build notes

- `vite.config.ts`'s `manualChunks` deliberately does **not** split
  `@mui/*`/`@emotion/*`/`react`/`react-redux` into separate chunks — MUI's
  internal circular references cause a `Cannot access X before initialization`
  crash at chunk-load time if they're split apart. Only genuinely standalone
  packages (`monaco-editor`, `mermaid`, the markdown editor, `react-live`) are
  isolated into their own vendor chunks.
- `allowedHosts` in `vite.config.ts` always includes
  `local.atharvadevasthali.com` and appends `VITE_DEV_ALLOWED_HOST` (from
  `.env`) if set to something different — it's additive, not a replacement.
- `npm run build` is the only way to catch some errors (e.g. Rollup chunking
  issues) that `tsc` alone won't — always run a real build before considering
  a frontend change verified.

## Tests

```bash
npm test         # vitest run
npm run test:watch
```
