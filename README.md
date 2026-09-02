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

### Preview the redesign (no Docker)

`docker compose` binds **8080** to the checkout you have mounted. To compare designs without Docker:

```bash
# NEW redesign (this branch) — use this URL
PORT=8090 BANNER='NEW redesign' node scripts/preview-server.js
```

Open **http://localhost:8090** — that is the redesigned storefront on this branch.

Public staging (after **Deploy staging**): **https://new.wineknot.co.il** — production apex **https://wineknot.co.il** stays on `main`.

Optional side-by-side with `main` on 8080:

```bash
ROOT=/tmp/wk-main-public
rm -rf "$ROOT" && mkdir -p "$ROOT"
git archive origin/main:frontend/public | tar -x -C "$ROOT"
PORT=8080 ROOT="$ROOT" BANNER='OLD site (main)' node scripts/preview-server.js
```

| Port | What you see |
|------|----------------|
| **8080** | Old storefront (`main` / production look), if you start the optional command above |
| **8090** | **New redesign** (this branch) |

The mock API reads `wines_data.json`. Stop with Ctrl+C.

### Admin panel

**http://localhost:8080/admin.html** (local dev — no login gate)

Production (`wineknot.co.il/admin.html` and `new.wineknot.co.il/admin.html`): Cloudflare Access email OTP for allowlisted addresses only (see `terraform/access.tf`).

- Update prices
- Upload images
- Add new wines
- Mark wines as out of stock

## Project structure

```
wine-knot/
├── docker-compose.yml      # MySQL + Backend + Nginx
├── wines_data.json         # Wine catalog (seed data)
├── frontend/public/        # Hebrew RTL storefront (static: index.html + css/site.css + js/app.js)
│   ├── css/site.css        # Design tokens + components (see docs/design/03-design-system.md)
│   ├── js/app.js           # Catalog, filters, /wine/:id route, cart, WhatsApp order
│   ├── fonts/              # Self-hosted Heebo + Assistant (Hebrew/Latin woff2)
│   └── admin.html          # Admin panel (unchanged)
├── docs/design/            # Redesign audit, direction and design system
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

### Query parameters

- `category` — slug (e.g. `red`, `white`)
- `search` — free-text search
- `min_price` — minimum price
- `max_price` — maximum price
- `sort` — `price_asc`, `price_desc`, `rating_desc`, `name_asc`

## Update wine data from Excel

```bash
.venv/bin/python scripts/import_excel.py "/path/to/pricelist.xlsx"
.venv/bin/python scripts/build_init_sql.py
docker compose down -v && docker compose up -d --build
```

## Sync live admin changes into the repo

Admin edits (prices, stock, recommended wines, uploaded images) live only on the
production server until you pull them back. To snapshot everything into
`wines_data.json`, `init.sql`, and local image files:

```bash
# One command (SSH to server + S3 images + rebuild seed files)
./scripts/sync_from_production.sh

# Or, if you already have a mysqldump:
./scripts/sync_from_production.sh /path/to/live-dump.sql
```

Requires SSH to the EC2 host (`terraform output public_ip`) and AWS CLI for S3.
Without SSH (e.g. CI): `./scripts/sync_from_production.sh --via-ssm` with
`EC2_INSTANCE_ID` and `S3_BUCKET` set.

**GitHub Actions:** **Sync from production** runs every Sunday at 04:00 UTC and can
be triggered manually (Actions tab). Set repo variable `S3_BUCKET` to
`terraform output -raw s3_bucket`. After changing `terraform/secrets.tf` IAM, run
`terraform apply` once so the deploy user can read S3.

Review with `git diff`, then commit and push — future deploys and
`terraform destroy/apply` will use this data.

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

Weekly **Sync from production** builds `backend/` and pushes to Docker Hub when these GitHub Actions secrets exist:

- `DOCKERHUB_USERNAME` (or `DOCKERHUB_USER`)
- `DOCKERHUB_TOKEN`

Optional variable `DOCKER_IMAGE_BACKEND` (default `{username}/wine-knot-backend`). Tags: `:latest`, `:{git sha}`, `:{YYYYMMDD}`. Each run writes a job summary (wine count, whether a catalog commit happened, whether an image was pushed).

Manual:

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

Then `scripts/deploy.sh` will `docker compose pull backend` and start that image (falls back to `--build` if pull fails).

Do **not** commit `.env`, `mysql_data`, or `.venv`.

## Git workflow

| Branch | Purpose |
|--------|---------|
| `main` | Production — what's live on wineknot.co.il. Pushing here auto-deploys. |
| `cursor/wine-knot-redesign-67b4` | Redesign; **Deploy staging** copies `frontend/public` to https://new.wineknot.co.il |
| `feature/...` | Short-lived branches for new work. Merge into `main` when ready. |

```bash
# Start a small change
git checkout main
git pull
git checkout -b feature/my-change

# ... edit, commit ...

git push -u origin feature/my-change
# Open a PR on GitHub → merge to main → production deploys automatically
```

## Auto-deploy (GitHub Actions)

Pushes to `main` trigger `.github/workflows/deploy.yml`, which uses **AWS SSM Run Command** to pull the latest code on the EC2 instance and rebuild Docker containers. No SSH from GitHub is required.

### One-time setup

1. Apply Terraform (adds SSM permissions and a deploy IAM user):
   ```bash
   cd terraform && terraform apply
   ```
2. Copy outputs into GitHub **Settings → Secrets and variables → Actions**:
   - Secret `AWS_ACCESS_KEY_ID` ← `github_actions_access_key_id`
   - Secret `AWS_SECRET_ACCESS_KEY` ← `github_actions_secret_access_key`
   - Secret `EC2_INSTANCE_ID` ← `github_actions_ec2_instance_id`
   - Variable `AWS_REGION` = `eu-north-1` (optional)
3. On an **existing** server (provisioned before SSM support), SSH in once and install the agent:
   ```bash
   sudo snap install amazon-ssm-agent --classic
   sudo systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service
   ```

Manual deploy: **Actions → Deploy → Run workflow** (optional branch input).

Staging (redesign on `new.wineknot.co.il`, apex unchanged): **Actions → Deploy staging (new.wineknot.co.il)**. Pushes to `cursor/wine-knot-redesign-67b4` also trigger it. The server script creates/updates the Cloudflare `new` A record when `/wine-knot/cloudflare_api_token` is readable.

Weekly catalog snapshot: **Actions → Sync from production** (Sunday 04:00 UTC). It always dumps live data; it only commits when `wines_data.json` / `init.sql` / wine images differ. Docker Hub push runs after that when Hub secrets are set.
