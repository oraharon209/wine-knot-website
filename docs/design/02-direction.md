# Wine Knot — visual direction

## The subject

Wine Knot is one person's list. Doron Aharon has tasted every bottle on it, given it a score (85–98) and written one line about it — in the spreadsheet the shop actually runs on. Customers order by WhatsApp and Doron delivers. The shop's own shelves carry handwritten paper tags. That is the world the design is built from: a knowledgeable merchant's annotated list, not a luxury boutique.

Audience: casual buyers who want a good bottle for dinner, gift buyers, and regulars who already know the bottle and want it in the cart in two taps. Single job of the homepage: make both groups start shopping within one screen.

## Directions explored

1. **The annotated list (chosen).** Paper-toned page, serif Hebrew display type, Doron's score and note treated as first-class product information, and a true list view of the catalog next to the grid. Restrained colour; typography and the merchant's voice carry the personality.
2. **The cellar.** Deep aubergine surfaces, bottle photography in dramatic light, gold rules. Rejected: it is the black-and-gold cliché the brief names, and it makes 180 white-background product shots look like cut-outs on velvet.
3. **The label.** Every card as a wine label: heavy borders, centred serif, ornamental rules. Rejected: decoration without information; 180 identical "labels" is exactly the repetitive card grid the brief warns about, and it fights with the real labels on the bottles.

## Critique of the chosen direction against generic defaults

- Warm paper + serif display is close to the common "cream + serif + terracotta" default. What makes it Wine Knot's and not a template: the accent is the logo's burgundy, not terracotta; the secondary is olive from vineyards, not a second warm; Hebrew editorial serif (Frank Ruhl Libre — the Israeli newspaper face) rather than a Latin display face with Hebrew fallback; product images printed onto the paper with a multiply blend so bottles sit on the page instead of in white boxes; and the signature below, which no other wine shop has because no other shop has Doron's scores and lines.
- Removed from the plan after review: an eyebrow line above the H1 (the heading carries itself), scroll-reveal on every section (one authored moment only), a gold promo bar (the deal becomes one quiet, factual band), and italics for Hebrew (Frank Ruhl Libre has no italic; Hebrew does not use one).

## Signature element: the score mark and the margin line

Every wine carries Doron's score set as a serif numeral on a hairline, with the label "ציון Wine Knot", and his note set in the serif beneath the name — the way a merchant annotates a list in the margin. It appears identically on cards, list rows and the product page, drives a "לפי ציון" sort and a minimum-score filter, and is the only place the logo's brass tone is used (the hairline). The knot from the logo, simplified to a small drawn glyph, marks Doron's recommended wines. Nothing else on the page is decorated.

## Palette (derived from the logo and the shop photograph)

| Token | Hex | Role |
| --- | --- | --- |
| `--paper` | `#F2EEE7` | Page background — limestone/paper, not cream |
| `--surface` | `#FBF9F5` | Inputs, drawers, dialogs, list rows on hover |
| `--surface-2` | `#E8E1D5` | Quiet bands (deal, how-it-works), skeletons |
| `--ink` | `#211C1A` | Text, primary borders on controls |
| `--ink-2` | `#5A4D45` | Secondary text (7.1:1 on paper) |
| `--ink-3` | `#7A6D64` | Muted text (4.7:1 on paper) |
| `--line` | `#D8CFC2` | Hairlines |
| `--wine` | `#5B1A33` | Primary action, active state, score numerals |
| `--wine-deep` | `#3F1023` | Hover/pressed |
| `--vine` | `#6C6A4C` | Olive secondary: recommended mark, availability, quiet labels |
| `--brass` | `#A8853A` | Score hairline only |
| `--error` | `#9B2C2C` | Errors, out-of-stock |

Six intentional hues (paper, ink, wine, vine, brass, error) plus tints. Burgundy is reserved for actions and the score; it is not the colour of headings.

## Typography

- Display and product names, prices, scores: **Heebo** (variable 400–800, Hebrew + Latin subsets, self-hosted) — cleaner modern sans after review feedback on Frank Ruhl Libre.
- Body, UI, metadata, Doron's note lines: **Assistant** (variable 200–800, Hebrew + Latin subsets, self-hosted).
- Scale (rem): 0.75 label · 0.8125 meta · 0.9375 ui · 1.0625 body · 1.25 lead · 1.5 h3 · 2 h2 · `clamp(2.25rem, 1.5rem + 3vw, 3.75rem)` h1.
- Line heights: body 1.6, headings 1.15, prices 1. Tabular numerals on prices, scores and the list view. No italics, no letter-spacing on Hebrew; `.02–.08em` only on small Latin labels.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [cart] [search…]                        Wine Knot  [mark]     │  header row 1
│ סופר פרימיום · חו״ל · אדום פרימיום · אדום · מתוקים · רוזה · … │  shelf strip
├──────────────────────────────────────────────────────────────┤
│ ┌────────────┐   הרשימה של דורון.                            │
│ │  3 featured│   כ־160 יינות, לכל אחד ציון ושורה אחת.         │  hero: type start,
│ │  bottles   │   23 שנה · משלוח עד הבית · הזמנה בוואטסאפ      │  featured picks end
│ │  + scores  │   [לכל היינות]  [ההמלצות של דורון]            │  (no shop photo)
│ └────────────┘                                               │
│  לפי תקציב ─────────  לפי ציון ─────────  לפי יקב ──────────    │  start here (typographic)
├──────────────────────────────────────────────────────────────┤
│  ההמלצות של דורון          ◦ ◦ ◦ ◦ ◦ (score + line prominent) │
├──────────────────────────────────────────────────────────────┤
│  כל היינות  181                                 [רשת] [רשימה] │
│  [סוג ▾][יקב ▾][מחיר ▾][ציון ▾][בציר ▾]   מיון ▾               │  filters
│  ▢ ▢ ▢ ▢   or   list rows                                    │
├──────────────────────────────────────────────────────────────┤
│  12 בקבוקים → בקבוק מתנה · 24 → מתנה פרימיום (one quiet band) │
│  איך מזמינים 1·2·3 (a real sequence)   ·   דורון אהרון        │
│  צרו קשר · footer                                            │
└──────────────────────────────────────────────────────────────┘
```

Grid: 12 columns conceptually, 1280 px container, 24 px gutters on phones and 40 px from 1024. Product grid: 2 columns from 360 px, 3 from 768, 4 from 1024. Section rhythm 64 px on phones, 96 px from 1024.

## Motion (intensity 3/10)

- One authored moment: the hero settles on load (headline, then featured bottles, then the start-here row), 600 ms, exponential ease-out, from an already-visible default.
- Hover/focus transitions 160 ms; drawers 260 ms `cubic-bezier(.2,.7,.2,1)`; cart badge scales once when the count changes; toast slides 8 px.
- No scroll-triggered reveals, no parallax, no image zoom on hover. `prefers-reduced-motion` and the site's own "עצירת אנימציות" switch disable everything.
