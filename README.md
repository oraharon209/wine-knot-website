# Wine Knot

Hebrew online wine shop — Node.js + MySQL + Nginx + Terraform/Cloudflare DNS

## Local setup

```bash
cd wine-knot
cp .env.example .env
docker compose up -d --build
```

Open in your browser: **http://localhost:8080**

Local dev uses HTTP only (no SSL certs). On the server, use `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d` for HTTPS on 443.

### Admin panel

**http://localhost:8080/admin.html**

Password: the value of `ADMIN_PASSWORD` in `.env` (default: `wineknot`)

- Update prices
- Upload images
- Add new wines
- Mark wines as out of stock

## Project structure

```
wine-knot/
├── docker-compose.yml      # MySQL + Backend + Nginx
├── wines_data.json         # Wine catalog (seed data)
├── frontend/public/        # Hebrew RTL storefront
├── backend/                # Express REST API
├── nginx/                  # Reverse proxy config
├── terraform/              # AWS deployment (optional)
└── scripts/                # Data import and image tooling
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/categories` | All categories |
| GET | `/api/wines` | Wine list (with filters) |
| GET | `/api/wines/:id` | Single wine |
| POST | `/api/wines` | Add wine |
| PUT | `/api/wines/:id` | Update wine |

### Query parameters

- `category` — slug (e.g. `red`, `white`)
- `search` — free-text search
- `max_price` — maximum price
- `min_rating` — minimum rating
- `sort` — `price_asc`, `price_desc`, `rating_desc`, `name_asc`

## Update wine data from Excel

```bash
.venv/bin/python scripts/import_excel.py "/path/to/pricelist.xlsx"
.venv/bin/python scripts/build_init_sql.py
docker compose down -v && docker compose up -d --build
```

## Wine bottle images

Images are stored in `frontend/public/images/wines/` and served at `/images/wines/`.

### Fetch images automatically

The fetch script searches for product bottle shots by wine name and winery:

```bash
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py          # skip existing
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py --force # re-fetch all
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py --fix-bad # re-fetch bad images
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py 40       # single wine by ID
```

### Normalize existing images

Standardize all images to clean white-background 600×900 product shots:

```bash
.venv/bin/python scripts/fix_wine_images.py --audit
.venv/bin/python scripts/fix_wine_images.py --normalize
```

Requires `rembg` and `onnxruntime` in the Python venv for background removal.

### Manual override

Place a file at `scripts/manual_images/{id}.jpg` (or the expected filename), then re-run fetch for that wine.

## DNS (production)

DNS is managed by **Terraform** (`terraform/cloudflare.tf`), not Docker. On `terraform apply`, the apex A record for `wineknot.co.il` points at the Elastic IP. Set your Cloudflare API token in `terraform/terraform.tfvars`.

## Stop

```bash
docker compose down
```

## Docker images

| Service | Image | Built by you? |
|---------|-------|---------------|
| **backend** | `wine-knot-backend:latest` | Yes — only custom image |
| mysql | `mysql:8.0` | No — official Docker Hub |
| nginx | `nginx:alpine` | No — frontend is mounted as files |

Old dangling `<none>` images from rebuilds are safe to remove:

```bash
docker image prune -f
```

### Push backend to Docker Hub

```bash
docker login
export DOCKERHUB_USER=yourusername
docker tag wine-knot-backend:latest $DOCKERHUB_USER/wine-knot-backend:latest
docker push $DOCKERHUB_USER/wine-knot-backend:latest
```

On the server, set in `.env`:

```
DOCKER_IMAGE_BACKEND=yourusername/wine-knot-backend:latest
```

Then `docker compose pull backend && docker compose up -d` (no local build needed).

### Push code to GitHub

```bash
git remote add origin https://github.com/oraharon209/wine-knot-website.git
git push -u origin cursor/initial-wine-knot-setup
```

Do **not** commit `.env`, `mysql_data`, or `.venv`.
