# Wine Knot — design system

Implemented as CSS custom properties and component classes in `frontend/public/css/site.css`. `compliance.css` (accessibility widget, cookie consent) consumes the same tokens. There is no build step: tokens are plain CSS variables on `:root`.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#EEEBE5` | Page background (limestone paper) |
| `--surface` | `#F8F6F2` | Bottle plates, inputs, drawers, dialogs, list-row hover |
| `--surface-2` | `#E3DFD6` | Quiet bands, skeletons, plate hover |
| `--ink` | `#211C1A` | Text, control borders, footer rule |
| `--ink-2` | `#5A4D45` | Secondary text (6.8:1 on paper) |
| `--ink-3` | `#6D6058` | Muted text and labels (5.1:1 on paper, 4.6:1 on surface-2) |
| `--line` / `--line-strong` | `#D8CFC2` / `#B9AD9D` | Hairlines / control borders |
| `--wine` / `--wine-deep` | `#5B1A33` / `#3F1023` | Primary action, active shelf, score numerals, step numbers |
| `--vine` / `--vine-tint` | `#5F5D41` / `#E9E7DA` | Recommended mark, gift lines, saving label, tags |
| `--brass` | `#A8853A` | Score hairline and the dash before Doron's line only |
| `--error` / `--error-tint` | `#9B2C2C` / `#F3E1E1` | Out of stock, errors |
| `--on-wine` | `#FBF7F3` | Text on wine |

Legacy aliases (`--wine-dark`, `--gold`, `--cream`, `--text`, `--muted`, `--border`) are kept for `compliance.css` and `admin.html`. High-contrast mode (`html.a11y-contrast`) collapses every token to black/white.

## Typography

- `--font-display`: Frank Ruhl Libre (variable 300–900). Headings, wine names, prices, scores, step numbers, footer wordmark.
- `--font-text`: Assistant (variable 200–800). Body, UI, metadata, buttons, labels.
- Both self-hosted from `/fonts/` as Hebrew + Latin woff2 subsets (≈92 KB total), `font-display: swap`, Hebrew subsets preloaded.
- Scale: `--fs-label` 12 · `--fs-meta` 13 · `--fs-ui` 15 · `--fs-body` 17 · `--fs-lead` 20 · `--fs-h3` 24 · `--fs-h2` 32 · `--fs-h1` `clamp(36px, 24px + 3vw, 60px)`. Product H1 `clamp(30px, 20px + 2vw, 44px)`.
- Line height: `--lh-body` 1.6, `--lh-tight` 1.15. `text-wrap: balance` on headings.
- Numerals: `.num` and all price/score/list cells use `tabular-nums lining-nums`.
- Rules: no italics (Frank Ruhl Libre has none; Hebrew does not use them), no letter-spacing on Hebrew, `.02–.04em` only on 12 px labels. Reading measure `--measure: 62ch`.

## Spacing and layout

- Scale (4 px base): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48 · `--s-8` 64 · `--s-9` 96 · `--s-10` 128.
- `--gutter` 24 px (40 px from 1024). `--container` 1280 px. `--section` 64 px (96 px from 1024); `.section + .section` removes the top padding so bands stack on one rhythm.
- Breakpoints: 768 (tablet: header search, 3-column grid, picks grid, list note column, filters always open), 1024 (desktop: hero two columns, 4-column grid, product two columns, buy bar hidden), 1440 (container maxes out).
- Grids: product `.grid` 2 / 3 / 4 columns. Picks: horizontal snap scroller on phones, 2 / 3 columns from 768 / 1024. Hero 7fr / 5fr. Product 5fr / 7fr. Footer 1.4fr + 3×1fr.

## Shape, elevation, motion

- Radii: `--r-1` 2 px (tags, focus), `--r-2` 4 px (controls, plates, cards, drawers), `--r-3` 6 px (unused reserve). Chips are pills; nothing else is.
- Borders: 1 px hairlines. Elevation is declared once per element: drawers, toast, cookie panel and the accessibility panel use `--shadow-drawer`/`--shadow-float` (offset + blur) without a border; bordered surfaces (buy bar, cookie banner) have no shadow.
- Motion: `--t-fast` 160 ms (hover, focus, toggles), `--t-med` 260 ms (drawers, badge bump, toast), `--t-hero` 600 ms (hero settle: copy → photo → start-here, the single authored moment). Easing `--ease-out: cubic-bezier(.2,.7,.2,1)`. Skeletons breathe (opacity) rather than shimmer. Everything is disabled under `prefers-reduced-motion` and the site's own "עצירת אנימציות".
- Z-index: header 100 · buy bar 120 · drawers 300 · toast 400 · age gate 500.

## Components

- **Buttons** `.btn` + `.btn-primary` (wine) · `.btn-secondary` (ink outline, fills on hover) · `.btn-quiet` (surface with border — header controls) · `.btn-text` (underlined) · sizes `.btn-sm`, `.btn-icon`, `.btn-block`. Minimum height 44 px (36 px for `.btn-sm`, used only inside cards/list rows next to other 44 px targets).
- **Form elements** `.input`, `.select` (custom chevron, positioned on the inline end), `.textarea`, `.field` (label above). Focus: 2 px ink ring. Placeholder `--ink-3`.
- **Stepper** `.qty` (`.qty-sm` in the cart): −/output/+ with 44 px (36 px) targets.
- **Chips** `.chip` for active filters (with drawn × icon) and quantity presets.
- **Tags** `.tag`, `.tag-oos`.
- **Score mark** `.score` (`.score-n` serif numeral in wine on a brass hairline, `.score-l` label); `.score-lg` on the product page.
- **Doron's line** `.note`: serif, `--ink-2`, brass dash; clamped to two lines on cards.
- **Knot** `.knot`: drawn infinity glyph + "מומלץ" in vine; only for recommended wines.
- **Product card** `.card`: 3:4 bottle plate (image absolutely positioned, `mix-blend-mode: multiply` so white-background shots print onto the paper), meta (winery · vintage), serif name as a stretched link, note, score + price row, full-width add button. `content-visibility: auto` for long grids.
- **Pick** `.pick`: horizontal variant for Doron's recommendations (plate 6–7 rem wide, larger note).
- **List** `.list`: the wine-list table — name + sub-line, note (≥768), score, price with struck shelf price, icon add button.
- **Shelf strip** `.shelves`: category navigation with live counts, scroll-snap on narrow screens, active state as a 2 px wine underline.
- **Toolbar** `.toolbar`: search (hidden ≥768 where the header search takes over), `<details>` filter disclosure (open on ≥768 or when filters are active), active-filter chips, sort, grid/list toggle.
- **Drawers** `.scrim` + `.drawer` (cart, mobile menu), slide from the inline end, focus-trapped, Escape to close.
- **Buy bar** `.buybar`: fixed bottom bar on product pages under 1024 px.
- **Toast** `.toast`: ink on paper, bottom centre, optional action.
- **Age gate** `.age-gate` / `.age-card`.
- **Bands**: `.deal` (surface-2, serif rule), `.steps` (real sequence, counters in wine), `.contact-list`, `.site-footer`.

## Image ratios

- Bottle plates 3:4 (cards, picks, related), product plate 4:5 capped at 34 rem, hero photograph 16:10 (1:1 from 1024). Product images keep `width="600" height="900"` attributes to reserve space; hero image has intrinsic dimensions and `fetchpriority="high"`.

## Copy conventions

- Controls name their action: "הוספה לעגלה", "שליחת ההזמנה בוואטסאפ", "הצגת עוד יינות (57 נוספים)", "ניקוי הכל".
- Doron's score is always labelled "ציון Wine Knot" (short form "ציון" on cards). His note is "השורה של דורון".
- Prices are "₪100"; the struck shelf price is read out as "מחיר מדף ₪120". Numbers, phone numbers and e-mail addresses are isolated with `.ltr`.
