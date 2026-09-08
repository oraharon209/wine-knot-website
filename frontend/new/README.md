# New storefront (`new.wineknot.co.il`)

Redesign files live here. The original shop stays in `frontend/public/` (apex `wineknot.co.il`).

Wine photos are not duplicated: `/images/wines/` is served from `frontend/public/images/wines`.

Local preview (no Docker):

```bash
PORT=8089 node scripts/preview-server.js
```

Open http://localhost:8089
