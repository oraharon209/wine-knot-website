# New storefront (`new.wineknot.co.il`)

This is the redesign. The original shop stays in `frontend/public/` (apex `wineknot.co.il`).

Wine photos are not duplicated: `/images/wines/` is served from `frontend/public/images/wines`.

```bash
PORT=8089 node scripts/preview-server.js
```

On your laptop, if port 8089 is still an old Docker site:

```bash
docker compose down
# or: docker ps  then docker stop <id>
fuser -k 8089/tcp   # Linux
```

Then pull this branch and run:

```bash
git pull
PORT=8089 node scripts/preview-server.js
```

The redesign is the `new/` folder at the repo root (not inside `frontend/`).
