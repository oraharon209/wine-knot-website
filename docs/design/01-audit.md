# Wine Knot — audit of the existing storefront

Date: 2026-09-01. Scope: `frontend/public` (storefront), backend API surface, catalog data, live site (`main` auto-deploys to wineknot.co.il, so the repo is the live site; Cloudflare blocks headless browsers, so the live UI was reproduced locally against a mock of the API fed by `wines_data.json`).

## Stack

| Layer | What it is | Consequence for the redesign |
| --- | --- | --- |
| Frontend | One static `index.html` (~1,900 lines: inline CSS + inline JS), `compliance.css/js` (a11y widget, cookie consent), two legal pages, `admin.html`. No framework, no bundler, no build step. | Redesign is plain HTML/CSS/JS. Split into `css/site.css` + `js/app.js` for cacheability and maintainability. |
| API | Express: `GET /api/categories`, `GET /api/wines` (`category`, `search`, `min_price`, `max_price`, `min_rating`, `sort`, `limit`, `offset`, `include_oos`), `GET /api/wines/recommended`, `GET /api/wines/:id`, admin routes. | Nothing to change. The whole catalog (~180 in-stock wines) is ~70 KB raw / ~12 KB gzipped, so the storefront can load it once and filter client-side. |
| Data | MySQL, seeded from Excel. Fields: `name`, `winery`, `country`, `vintage`, `grape`, `rating`, `shelf_price`, `sale_price`, `notes`, `image_url`, `out_of_stock`, category (8 shelves). | See data facts below. |
| Hosting | nginx (static + `/api` proxy, `try_files … /index.html`), Docker, EC2, S3 for images in production, Cloudflare in front. CSS/JS cached 30 days immutable. | Client-side routes like `/wine/123` already fall through to `index.html`. Asset URLs need a version query to bust the 30-day cache. |
| Commerce | Cart in `localStorage`, quantity presets 1/6/12, "12 + 1 gift bottle" rule, order sent as a WhatsApp message. No payment gateway; payment (PayBox, Bit, transfer, cheque, cash) is settled with Doron. | "Checkout" is the WhatsApp handoff. Preserve the message format, gift computation, cart key. |
| Compliance | Age gate (18+), cookie consent (Israeli Privacy Law amendment 13), accessibility widget (IS 5568), skip link, focus traps, `prefers-reduced-motion`. | Keep all behaviour; restyle to the new tokens. |

## Data facts (192 wines, 181 in stock)

- Categories (Doron's shelves): לבן 50 · אדום 61 · אדום פרימיום 36 · יינות חוץ לארץ 24 · רוזה 7 · נתזים ושמפניות 6 · מתוקים 5 · סופר פרימיום 3.
- `rating` is present on every wine (85–98) — Doron's own score. `notes` on 98% — one short merchant line ("מומלץ ביותר מחיר פיצוץ", "פינו נואר ישראלי היחיד ברשימה", "24 חודשי חבית").
- 189/192 have a shelf price above the Wine Knot price (median saving 13%).
- `vintage` on 29%. `grape` on 0%. `country` is "ישראל" or empty (imports are mis-tagged). No region, no kosher field (two notes mention it), no food pairing.
- 65 wineries; the top four (טוליפ, לוריא, אדיר, דלתון) cover a third of the list. For imports the `winery` field often holds the appellation (אמרונה, בארולו, קיאנטי קלאסיקו).
- Images: 191 files, 85% white-background 600×900 bottle shots, 15% photos with backgrounds; 21 files over 300 KB, six PNGs at ~4 MB (served from S3 in production).

Therefore the honest filter set is: type (category), winery, price, Wine Knot score, vintage (where present), free text. Grape/region/kosher/pairing filters would be fake and are not built.

## What works (keep)

- Commerce logic is correct and defensive: cart persistence, gift-bottle maths, WhatsApp message builder, URL-synced filters, input clamping, focus traps, Escape handling, skeletons, lazy images, `content-visibility`.
- Real merchant voice in the data (scores + notes) and a real photograph of the shelves with handwritten tags.
- Compliance layer is thorough for an Israeli shop.
- Fast: no framework, no third-party scripts.

## Visual problems

- The generic wine-site template: burgundy gradient header, gold accents, dark-overlaid bottle photo with centred white "Wine Knot", gold promo strip, rounded pill nav.
- Four saturated accents compete on every screen: burgundy, gold, alert red (discount pills), two greens (12+1 gradient buttons, WhatsApp).
- No typographic system: `system-ui` throughout, wine names in an unrelated navy (#1a3a5c), arbitrary sizes (.7/.75/.8/.82/.85/.9/.95 rem).
- Emoji as icons (🔍 🛒 🎁 💬 📞 ✉️ ⭐ 🍷 🚫).
- Product card overload: three buy buttons per card with sub-copy, up to three badges, repeated 12–180 times.
- Categories rendered three times (header nav, category cards, mobile select). The 12+1 deal appears in the promo bar, on every card, in the modal and in the cart.
- About/contact are centred text blocks; the footer is an afterthought.

## UX problems

- Discovery: only type, free text, two numeric price inputs and a sort. No winery, no score filter (the API supports `min_rating`), no price presets, no list view for people who know what they want.
- Product detail is a small modal: no URL, no related wines, the note is shown as a beige box, the score as "⭐ דירוג".
- On a phone the first product appears ~1,000 px down (hero → promo → search → three selects → recommendations).
- Cards are ~700 px tall on mobile; the grid is one column.
- The WhatsApp handoff is a single button; nothing explains what happens next (confirmation, delivery area, payment).
- Wine names contain double spaces and trailing commas from the spreadsheet; they render as-is.

## Accessibility

Good base (labels, `aria-*`, focus traps, skip link, reduced motion, IS 5568 widget). Gaps: emoji icons announced literally, colour-only discount meaning, `.wine-card` hover border only, small badge text (11 px), gold-on-white badge contrast (~2.1:1), the whole card is a click target but not focusable (buttons inside are — acceptable).

## Performance

One HTML request with inline CSS/JS (no separate caching); hero JPEG preloaded; product images fixed 200×200 boxes with lazy loading; no web fonts. The real cost is the 4 MB PNGs in the catalog (S3), which the frontend can only mitigate with lazy loading and `decoding=async`.

## SEO

SPA with a single `<title>`/description, no product URLs, no structured data, no sitemap. Category URLs are `/?category=slug`. These URLs are preserved; `/wine/:id` is added.

## Technical constraints

- Must stay plain static files behind nginx; no build step introduced.
- Images may be absolute S3 URLs (`image_url` resolved by the API) — never hard-code paths.
- CSP (report-only) allows `'self'` + Google Fonts; fonts are self-hosted anyway.
- `compliance.css` high-contrast mode overrides the CSS variables by name — token names must be mapped there.
- `wineknot_cart`, `wineknot_age_verified`, `wineknot_a11y`, `wineknot_consent` storage keys are kept.
