# FilDOS Brand & Design System

The canonical identity system for FilDOS. Apply this whenever building or
restyling UI in the **desktop app** (the repo root). The tokens below are
wired into `src/renderer/src/styles/global.css` (Tailwind v4 `@theme` +
CSS variables) — use the semantic utilities, don't hard-code hexes. The six
scoops are exposed as `strawberry`/`bubblegum`/`mango`/`blueberry`/`mint`/`grape`
colour utilities (e.g. `fill-mint`, `text-grape`, `bg-mango`).

## Colour

| Token | Hex | Role |
|-------|-----|------|
| **Ink** | `#0f1117` | Primary. Text, wordmark, dark-mode app shell, deep backgrounds. |
| **Mist** | `#8a8f9c` | Secondary text, UI chrome, placeholders → `text-muted-foreground`. |
| **Cloud** | `#f5f5f7` | Light-mode surfaces, hover states, inputs → `bg-muted` / `bg-accent`. |
| **White** | `#ffffff` | Light-mode canvas: cards, modals, content surfaces. |
| Light text on dark | `#eef2fb` | `foreground` in dark mode. |

**Six scoops — accent only, never body text/chrome:**

| Name | Hex |
|------|-----|
| Strawberry | `#F26D6D` |
| Bubblegum | `#F286B4` |
| Mango | `#F9A85C` |
| Blueberry | `#6E9BEE` |
| Mint | `#4FC9B8` |
| Grape | `#A585E0` |

- Azure (`#0295f6`) is retired. The foundation is black-and-white; the six
  scoops carry all colour, always as an accent (tag, dot, chip, corner), never
  as a large fill or as body text.
- Map one scoop to one meaning consistently app-wide, e.g. Smart Collections
  (Tax & finance→Mint, Receipts→Mango, Screenshots→Blueberry) and Tags
  (Work→Blueberry, Personal→Grape, Important→Strawberry). Reuse these
  assignments rather than inventing new ones per screen.
- **Selection** is a translucent Ink/white wash (`bg-primary/15`) by default;
  inside a categorized list (collections, tags), tint the row with that item's
  own scoop instead.
- AI-specific highlights (sparkle icons, "thinking" states, matched-text
  emphasis) consistently use **Mint**.

## Type

- **Space Grotesk** — UI · interface · display. Weights: Light 300, Regular 400,
  Medium 500. Backs `font-sans` (the default body font).
- **Space Mono** — wordmark · code · technical. Weights 400 / 700. Backs
  `font-mono`; use it for file paths, CIDs, hashes, metadata keys, CLI text.
- Self-hosted via `@fontsource/*` (imported in `main.tsx`) — no CDN, CSP-safe.
- Don't change font weights or introduce other typefaces.

## Mark

A 3×3 grid of rounded-square tiles (not circles): 6 active tiles form a
reversed "F", 3 ghost tiles (neutral, low-opacity) hold the grid. Each active
tile takes one of the six scoops, always in the same warm→cool position order
(Strawberry, Bubblegum, Mango / Blueberry, Mint / Grape). Minimum size 14px.
Ghost tiles are Ink at 8% opacity on light, White at 16% on dark — never
recoloured. `<Mark>` in `components/Logo.tsx` renders `<rect>` tiles per-position
with a fixed scoop map (`fill-*` utilities; ghosts use `fill-foreground` at low
opacity). The OAuth `callbackPage.ts` inlines the same tile mark.

## Wordmark

"Fil" + "DOS", implemented as `<Wordmark>` / `<Logo>` in `components/Logo.tsx`:

- **Fil** — Space Grotesk 300, follows the current text colour.
- **DOS** — Space Mono 400, **also follows the current text colour** (Ink on
  light, white on dark). DOS is no longer hard-coded Azure — the wordmark
  stays fully neutral now; colour lives only in the mark.
- Use `<Logo>` (mark + wordmark) for the default horizontal lockup.

## File-type icons

- `src/renderer/src/assets/file-icons/*.svg` — same folded-sheet silhouette
  for every type; the folded corner tag now matches **each icon's own accent
  colour** (not a fixed brand blue).
- Generic content types are assigned scoops by family: media (Strawberry/
  Bubblegum), documents/text (Blueberry), data (Mint), containers/archives
  (Mango), system/misc (Grape).
- File types with an established external brand colour (PDF, Git, Docker) and
  all programming-language chips keep their own conventional colour — do not
  scoop-ify those.
- `src/renderer/src/assets/brand/fildos-mark-tiles.svg` — the standalone scoop
  mark; `fildos-appicon-ink.svg` — the app/window icon (mark on an Ink tile,
  for packaging; not yet wired into a builder). The retired `icon-azure/dark/
  light.svg` sources are removed.