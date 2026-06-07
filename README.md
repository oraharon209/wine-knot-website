# Wine Knot 🍷

חנות יין אונליין בעברית — Node.js + MySQL + Nginx + Cloudflare DDNS

## הרצה מקומית

```bash
cd wine-knot
cp .env.example .env
docker compose up -d --build
```

פתחו בדפדפן: **http://localhost:8080**

### פאנל ניהול (לאבא)

**http://localhost:8080/admin.html**

סיסמה: ערך `ADMIN_PASSWORD` בקובץ `.env` (ברירת מחדל: `wineknot`)

- עדכון מחירים
- העלאת תמונות
- הוספת יין חדש
- סימון "אזל מהמלאי"

## מבנה הפרויקט

```
wine-knot/
├── docker-compose.yml      # MySQL + Backend + Nginx (+ Cloudflare DDNS בפרודקשן)
├── wines_data.json         # 177 יינות (נתוני דוגמה)
├── frontend/public/        # אתר בעברית RTL
├── backend/                # Express REST API
├── nginx/                  # הגדרות פרוקסי
└── scripts/                # יצירת נתונים מ-Excel/JSON
```

## API

| Method | Endpoint | תיאור |
|--------|----------|--------|
| GET | `/api/health` | בדיקת תקינות |
| GET | `/api/categories` | כל הקטגוריות |
| GET | `/api/wines` | רשימת יינות (עם סינון) |
| GET | `/api/wines/:id` | יין בודד |
| POST | `/api/wines` | הוספת יין |
| PUT | `/api/wines/:id` | עדכון יין |

### פרמטרי סינון

- `category` — slug (לדוגמה: `red`, `white`)
- `search` — חיפוש חופשי
- `max_price` — מחיר מקסימלי
- `min_rating` — דירוג מינימלי
- `sort` — `price_asc`, `price_desc`, `rating_desc`, `name_asc`

## עדכון נתוני יין מ-Excel

```bash
.venv/bin/python scripts/import_excel.py "/path/to/מחירון.xlsx"
.venv/bin/python scripts/build_init_sql.py
docker compose down -v && docker compose up -d --build
```

## הוספת תמונות בקבוקים

הסקריפט מחפש תמונת מוצר לפי שם היין + יקב (לא תמונה אקראית):

```bash
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py --force   # הכל מחדש
PYTHONUNBUFFERED=1 .venv/bin/python scripts/fetch_wine_images.py 40      # יין בודד לפי ID
```

**תמונה ידנית** (כמו הדוגמה של קסטל C): שימו קובץ ב-`scripts/manual_images/{id}.jpg`

התמונות נשמרות ב-`frontend/public/images/wines/` ומוצגות באתר.

## Cloudflare DDNS (פרודקשן)

```bash
# הוסיפו ל-.env:
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ZONE=wine-knot.co.il
CLOUDFLARE_SUBDOMAIN=@

docker compose --profile production up -d
```

## עצירה

```bash
docker compose down
```

## Docker images — מה בפנים?

| Service | Image | Built by you? |
|---------|-------|---------------|
| **backend** | `wine-knot-backend:latest` | Yes — only custom image |
| mysql | `mysql:8.0` | No — official Docker Hub |
| nginx | `nginx:alpine` | No — frontend is mounted as files |
| cloudflare-ddns | `oznu/cloudflare-ddns` | No — third-party |

The `<none>` images you saw are old rebuild leftovers — safe to delete:

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
git remote add origin https://github.com/YOUR_USER/wine-knot.git
git push -u origin cursor/initial-wine-knot-setup
```

Do **not** commit `.env`, `mysql_data`, or `.venv`.
