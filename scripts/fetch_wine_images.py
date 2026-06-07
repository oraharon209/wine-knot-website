#!/usr/bin/env python3
"""Fetch product bottle images matching each wine by name."""
import json
import re
import sys
import time
from io import BytesIO
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'wines_data.json'
IMG_DIR = ROOT / 'frontend' / 'public' / 'images' / 'wines'
CACHE_PATH = ROOT / 'scripts' / 'image_cache.json'
MANUAL_DIR = ROOT / 'scripts' / 'manual_images'

# Wines with hand-picked product photos — never auto-overwrite
MANUAL_IDS = {40}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
}

WINERY_EN = {
    'קסטל': 'Castel', 'דלתון': 'Dalton', 'טוליפ': 'Tulip', 'פסגות': 'Psagot',
    'יקבי הגולן': 'Golan Heights', 'גולן': 'Golan Heights', 'רקנאטי': 'Recanati',
    'כרמל': 'Carmel', 'ברקן': 'Barkan', 'טפרברג': 'Tepperberg', 'ירדן': 'Yarden',
    'רמת הגולן': 'Golan Heights', 'רמת נגב': 'Ramat Negev', 'ויתקין': 'Vitkin',
    'אדיר': 'Adir', 'לוריא': 'Luria', 'מוני': 'Montefiore', 'מאיה': 'Maya',
    'שילה': 'Shiloh', 'סגל': 'Segal', 'רוטשילד': 'Rothschild', 'עמק האלה': 'Emek HaEla',
    'רזיאל': 'Raziel', 'כרם שבו': 'Kerem Shavo', 'אלונה': 'Alona', 'קטן': 'Katten',
}

GRAPE_EN = {
    'שרדונה': 'Chardonnay', 'סוביניון': 'Sauvignon Blanc', 'קברנה': 'Cabernet Sauvignon',
    'מרלו': 'Merlot', 'סירה': 'Syrah', 'רוזה': 'Rose', 'רוז': 'Rose',
    'גוורצ': 'Gewurztraminer', 'ריזלינג': 'Riesling', 'פינו': 'Pinot Noir',
    'מוסקט': 'Muscat', 'שיראז': 'Shiraz', 'קברנה סוביניון': 'Cabernet Sauvignon',
}

GOOD_HOSTS = (
    'wineroute', 'wines.co.il', 'wine21', 'gate2wine', 'thewineshop', 'castel',
    'dalton', 'psagot', 'golanwines', 'recanati', 'carmelwinery', 'teperberg',
    'yarden', 'shilo-wines', 'barkan', 'vitkin', 'wolt', 'amazon', 'wikipedia',
)

BAD_HOSTS = (
    'pinterest', 'facebook', 'instagram', 'tiktok', 'heavyhaul', 'ideacdn',
    'clipart', 'icon', 'logo', 'emoji', 'avatar', 'banner', 'blogspot',
)


def winery_english(winery):
    if not winery:
        return ''
    w = winery.split('/')[0].split('(')[0].strip()
    for he, en in WINERY_EN.items():
        if he in w:
            return en
    return w


def grapes_in_name(name):
    found = []
    for he, en in GRAPE_EN.items():
        if he in name:
            found.append(en)
    return found


def normalize_name(name):
    n = re.sub(r'\s+', ' ', name.strip())
    # keep product codes like "C", "VAT2"
    return n


def build_queries(wine):
    name = normalize_name(wine.get('name', ''))
    winery = wine.get('winery', '')
    w_en = winery_english(winery)
    grapes = grapes_in_name(name)

    queries = []

    # Specific product patterns
    if 'קסטל C' in name or 'קסטל  C' in name:
        queries.append('Castel C Chardonnay bottle')
        queries.append('Domaine du Castel C Blanc bottle')
        queries.append('קסטל C שרדונה בקבוק')

    if w_en and name:
        queries.append(f'{w_en} {name} bottle')
        queries.append(f'{w_en} {name} wine bottle product')

    if w_en and grapes:
        queries.append(f'{w_en} {grapes[0]} bottle')
        for g in grapes[:2]:
            queries.append(f'{w_en} {g} wine Israel bottle')

    if name:
        queries.append(f'{name} בקבוק יין')
        queries.append(f'{name} wine bottle')

    # dedupe preserving order
    seen = set()
    out = []
    for q in queries:
        q = q.strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
    return out[:6]


def score_url(url, query):
    u = url.lower()
    score = 0
    if any(g in u for g in GOOD_HOSTS):
        score += 30
    if any(b in u for b in BAD_HOSTS):
        score -= 50
    q_words = [w for w in re.split(r'\W+', query.lower()) if len(w) > 2]
    for w in q_words[:4]:
        if w in u:
            score += 5
    if u.endswith(('.jpg', '.jpeg', '.png', '.webp')):
        score += 3
    if 'product' in u or 'bottle' in u or 'wine' in u:
        score += 2
    return score


def search_image_urls(query):
    urls = []
    try:
        resp = requests.get(
            'https://www.bing.com/images/search',
            params={'q': query, 'qft': '+filterui:photo-photo', 'form': 'HDRSC2', 'first': 1},
            headers=HEADERS,
            timeout=15,
        )
        found = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', resp.text)
        urls.extend(found[:12])
    except Exception:
        pass

    if len(urls) < 4:
        try:
            from duckduckgo_search import DDGS
            with DDGS() as ddgs:
                for r in ddgs.images(query, max_results=8):
                    u = r.get('image') or r.get('thumbnail')
                    if u:
                        urls.append(u)
        except Exception:
            pass

    ranked = sorted(
        dict.fromkeys(urls),
        key=lambda u: score_url(u, query),
        reverse=True,
    )
    return [u for u in ranked if score_url(u, query) > -20]


def validate_image(data):
    try:
        from PIL import Image
        img = Image.open(BytesIO(data))
        w, h = img.size
        if w < 120 or h < 200:
            return False, 'too small'
        if w > h * 1.5:  # reject very wide banners
            return False, 'too wide'
        return True, f'{w}x{h}'
    except Exception as e:
        return False, str(e)


def download_image(url, dest):
    resp = requests.get(url, headers=HEADERS, timeout=25)
    resp.raise_for_status()
    data = resp.content
    if len(data) < 4000:
        raise ValueError('file too small')
    ok, info = validate_image(data)
    if not ok:
        raise ValueError(f'bad image: {info}')
    # normalize to JPEG
    from PIL import Image
    img = Image.open(BytesIO(data)).convert('RGB')
    img.save(dest, 'JPEG', quality=90)


def main():
    force = '--force' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--force']
    limit = int(args[0]) if len(args) > 0 and args[0].isdigit() else 0
    offset = int(args[1]) if len(args) > 1 and args[1].isdigit() else 0
    only_id = int(args[0]) if len(args) == 1 and args[0].isdigit() and limit else 0

    IMG_DIR.mkdir(parents=True, exist_ok=True)

    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)

    cache = {}
    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text(encoding='utf-8'))

    wines = data['wines']
    if only_id:
        wines = [w for w in wines if w['id'] == only_id]
    else:
        wines = wines[offset:]
        if limit:
            wines = wines[:limit]

    ok = skip = fail = 0
    for wine in wines:
        wid = wine['id']
        dest = IMG_DIR / f'{wid}.jpg'

        manual = MANUAL_DIR / f'{wid}.jpg'
        if manual.exists():
            from shutil import copy2
            copy2(manual, dest)
            print(f'[{wid}] manual override')
            ok += 1
            continue
        if wid in MANUAL_IDS and dest.exists() and dest.stat().st_size > 4000:
            print(f'[{wid}] keeping manual image')
            skip += 1
            continue

        if not force and dest.exists() and dest.stat().st_size > 4000:
            skip += 1
            continue

        queries = build_queries(wine)
        cache_key = f"{wid}:{wine.get('name','')}"
        urls = cache.get(cache_key, [])
        if isinstance(urls, str):
            urls = [urls]

        if not urls:
            print(f'[{wid}] {wine["name"]} / {wine["winery"]}')
            for q in queries:
                print(f'  query: {q}')
                found = search_image_urls(q)
                urls.extend(found)
                time.sleep(1.0)
                if len(urls) >= 8:
                    break
            # dedupe + rank
            urls = list(dict.fromkeys(urls))
            cache[cache_key] = urls
            CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')

        saved = False
        for url in urls:
            try:
                download_image(url, dest)
                print(f'[{wid}] OK -> {dest.name}')
                ok += 1
                saved = True
                break
            except Exception as e:
                print(f'[{wid}] reject: {e}')
                continue

        if not saved:
            print(f'[{wid}] FAILED - no matching product image')
            fail += 1
        time.sleep(0.5)

    print(f'Done: {ok} downloaded, {skip} skipped, {fail} failed')


if __name__ == '__main__':
    main()
