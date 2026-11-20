# @basaltac/ui

One Solid component library for every company product — Basalt ink theme, Kobalte primitives, shadcn-style API. Source-shipped (`.tsx`); consuming vite configs compile the JSX, and types come straight from source.

## Install

```bash
bun add @basaltac/ui
```

Requires: vite + Solid + Tailwind CSS v4 (the company stack).

## Consumer setup — 3 lines, once

**1. `app.css`** — import the theme (after `tailwindcss`), then let Tailwind scan the package source:

```css
@import "tailwindcss";
@import "@basaltac/ui/theme.css";
@source "../node_modules/@basaltac/ui/src";
```

`theme.css` carries the ink palette (`--background`, `--primary`, …) and token mappings. Layer product-specific fonts/colors on top via your own `@theme inline`.

**2. `vite.config.ts`** — keep one shared copy of the package (both lines):

```ts
ssr: { noExternal: ["@basaltac/ui"] },
optimizeDeps: { exclude: ["@basaltac/ui"] },
```

**3. Use it:**

```tsx
import { Button, Dialog, toast } from "@basaltac/ui"
```

## Gotchas

- **Fonts are yours.** Components assume token colors/radius only; set your own `--font-sans` on `body`.
- **SSR hydration mismatch with Kobalte dialogs/menus?** Copy the one-line solid-js fix from this repo: `patches/solid-js@1.9.17.patch` (overriddenDependencies in your package.json).
- **Dark mode**: `theme.css` defines the dark-first `:root` palette and the `.dark` variant; add `.dark` overrides yourself if a product needs a light mode.

## Developing components

Edit `packages/ui/src/` in this monorepo — web consumes `@basaltac/ui` via `workspace:*`, so changes are live immediately. New components go in `src/components/ui/` and export from `src/index.ts`.

## Publishing

Automated: merge to `main` touching `packages/ui/**` → the `ui release` workflow publishes. A version bump in the PR wins; if the version is unchanged but `src/**` differs from the published tarball, it auto-bumps the patch and publishes; if src is byte-identical to npm it skips (doc-only merges never cut a release). Requires the `NPM_TOKEN` repo secret (npm automation token from the account that owns the `@basaltac` org).

Manual (first publish, or escape hatch):

```bash
cd packages/ui
npm version patch        # breaking change while 0.x → bump minor (0.2.0)
npm publish              # public; requires npm login on the @basaltac org
```

