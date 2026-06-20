# FilDOS Brand & Design System

The canonical identity system for FilDOS. Apply this whenever building or
restyling UI in the **desktop app** (`desktop-app/`). The tokens below are
already wired into `desktop-app/src/renderer/src/styles/global.css` (Tailwind v4
`@theme` + CSS variables) — use the semantic utilities, don't hard-code hexes.

## Colour

| Token | Hex | Role |
|-------|-----|------|
| **Azure** | `#0295f6` | Primary brand. CTAs, active/selected states, focus rings, the mark. |
| **Ink** | `#0c1322` | Dark-mode app shell / deep backgrounds. (`#0f1117` = ink text on light.) |
| **Mist** | `#7c87a6` | Secondary text, UI chrome, placeholders → `text-muted-foreground`. |
| **Cloud** | `#f0f1f5` | Light-mode surfaces, hover states, inputs → `bg-muted` / `bg-accent`. |
| **White** | `#ffffff` | Light-mode canvas: cards, modals, content surfaces. |
| Light text on dark | `#eef2fb` | `foreground` in dark mode. |

- Use the semantic shadcn tokens (`bg-primary`, `text-muted-foreground`,
  `bg-card`, `border-border`, …) which map to the palette in both themes.
- Raw brand utilities also exist: `bg-azure`, `text-azure`, `text-mist`,
  `bg-cloud`, `bg-ink`.
- **Selection** is a translucent Azure wash (`bg-primary/15`), never solid
  Azure — solid fill hides the Azure-tinted file icons.

## Type

- **Space Grotesk** — UI · interface · display. Weights: Light 300, Regular 400,
  Medium 500. Backs `font-sans` (the default body font).
- **Space Mono** — wordmark · code · technical. Weights 400 / 700. Backs
  `font-mono`; use it for file paths, CIDs, hashes, metadata keys, CLI text.
- Self-hosted via `@fontsource/*` (imported in `main.tsx`) — no CDN, CSP-safe.
- Don't change font weights or introduce other typefaces.

## Mark

A 3×3 node grid: 6 active nodes form a reversed "F", 3 ghost (dimmed) nodes hold
the grid. Minimum size 14px. Only ever Azure, White, or Ink — never recolour it
otherwise. Implemented as `<Mark>` in `components/Logo.tsx` (draws in
`currentColor`; ghost nodes at ~0.22 opacity).

## Wordmark

"Fil" + "DOS", implemented as `<Wordmark>` / `<Logo>` in `components/Logo.tsx`:

- **Fil** — Space Grotesk 300, follows the current text colour (Filecoin
  protocol layer).
- **DOS** — Space Mono 400, **always Azure** (terminal / OS heritage).
- Keep "Fil" light and "DOS" mono; on dark surfaces DOS stays Azure, Fil stays
  light. Use `<Logo>` (mark + wordmark) for the default horizontal lockup.

## Assets

- `desktop-app/src/renderer/src/assets/file-icons/*.svg` — file-type icons
  (line-style, Azure-tinted), mapped in `lib/fileLogo.ts`.
- `desktop-app/src/renderer/src/assets/brand/icon-{azure,dark,light}.svg` —
  app/window icon source (for packaging; not yet wired into a builder).
