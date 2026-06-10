#!/usr/bin/env python3
"""Fetch product bottle images matching each wine by name and vintage."""

import json
import re
import sys
import time
from pathlib import Path

import requests
from ddgs import DDGS

from wine_bottle_validate import is_wine_bottle
from wine_image_names import (
    extract_years,
    wine_image_filename,
    winery_short,
)
from wine_image_names import (
    normalize as normalize_name,
)
from wine_image_normalize import normalize_bottle_image

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'wines_data.json'
IMG_DIR = ROOT / 'frontend' / 'public' / 'images' / 'wines'
CACHE_PATH = ROOT / 'scripts' / 'image_cache.json'
MANUAL_DIR = ROOT / 'scripts' / 'manual_images'

MANUAL_IDS = set()

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ),
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.8',
}

WINERY_EN = {
    'קסטל': 'Castel',
    'דלתון': 'Dalton',
    'טוליפ': 'Tulip',
    'פסגות': 'Psagot',
    'יקבי הגולן': 'Golan Heights',
    'גולן': 'Golan Heights',
    'רקנאטי': 'Recanati',
    'כרמל': 'Carmel',
    'ברקן': 'Barkan',
    'טפרברג': 'Tepperberg',
    'ירדן': 'Yarden',
    'רמת הגולן': 'Golan Heights',
    'רמת נגב': 'Ramat Negev',
    'ויתקין': 'Vitkin',
    'אדיר': 'Adir',
    'לוריא': 'Luria',
    'מוני': 'Montefiore',
    'מאיה': 'Maya',
    'שילה': 'Shiloh',
    'סגל': 'Segal',
    'רוטשילד': 'Rothschild',
    'עמק האלה': 'Emek HaEla',
    'רזיאל': 'Raziel',
    'כרם שבו': 'Kerem Shavo',
    'אלונה': 'Alona',
    'קטן': 'Katten',
}

GOOD = (
    'wineconnection',
    'alcoholmarket',
    'paneco',
    'wineroute',
    'alcohome',
    'vivino',
    'winebuyers',
    'gate2wine',
    'wines.co.il',
    'wine21',
    'mashkaot',
    'banamashkaot',
    'eretzhagalil',
    'winehouse',
    'wine-club',
    'manovino',
    'grape-man',
    'hibur',
    'gmp.ae',
    'winewarehouse',
    'dalton',
    'carmel',
    'tulip',
    'castel',
    'golanwines',
    'recanati',
    'teperberg',
    'barkan',
    'shilo',
    'psagot',
    'vitkin',
    'yarden',
    'adir-winery',
    'winedepot',
    'manwithwine',
)
BAD = (
    'pinterest',
    'facebook',
    'instagram',
    'tiktok',
    'flower2u',
    'coloring',
    'clipart',
    'calendar',
    'kalender',
    'dogbreed',
    'template.net',
    'ftcdn',
    'shutterstock',
    'pngtree',
    'lovepik',
    'coffeco',
    'travelourplanet',
    'cq.ru',
    'batshonfish',
    'pokemon',
    'imdb',
    'poster',
    'wallpaper',
    'deviantart',
    'fanpop',
    'zerochan',
    'wikia',
    'fandom',
    'grave',
    'cemetery',
)


def winery_english(winery):
    w = winery_short(winery)
    for he, en in WINERY_EN.items():
        if he in w:
            return en
    return w


def build_queries(wine):
    name = normalize_name(wine.get('name', '')).rstrip(',').strip()
    base_name = normalize_name(re.sub(r'\s*20\d{2}\s*|\s*19\d{2}\s*', ' ', name)).strip()
    winery = winery_short(wine.get('winery', ''))
    w_en = winery_english(winery)
    years = extract_years(wine)

    queries = []

    for year in years:
        queries.extend(
            [
                f'{base_name} {winery} {year}',
                f'{winery} {base_name} {year}',
                f'{name} {winery} {year} בקבוק',
                f'{winery} {base_name} {year} בקבוק יין',
            ]
        )
        if w_en:
            queries.extend(
                [
                    f'{w_en} {base_name} {year} bottle wine',
                    f'{w_en} {base_name} {year} bottle Israel',
                ]
            )

    queries.extend(
        [
            f'{name} {winery} בקבוק יין',
            f'{winery} {name} בקבוק',
            f'{name} {winery}',
            f'{winery} {name}',
        ]
    )
    if w_en:
        queries.extend(
            [
                f'{w_en} {base_name} bottle wine',
                f'{w_en} {base_name} wine bottle Israel',
            ]
        )

    if 'קסטל C' in name or 'קסטל  C' in name:
        for q in ['קסטל C שרדונה בקבוק', 'Castel C Chardonnay bottle']:
            queries.insert(0, q)

    if 'סדרת אסטייט' in name:
        grape = (
            'cabernet'
            if 'קברנה' in name
            else 'merlot'
            if 'מרלו' in name
            else 'shiraz'
            if 'שירז' in name
            else 'petit'
        )
        for q in [
            f'Dalton Estate {grape} bottle Israel',
            f'דלתון אסטייט {base_name} בקבוק',
            f'dalton-winery.com estate {grape}',
        ]:
            queries.insert(0, q)

    if 'family collection' in name.lower():
        grape = 'shiraz' if 'שירז' in name else 'cabernet'
        for q in [
            f'Dalton Family Collection {grape} bottle',
            f'דלתון Family Collection {grape} בקבוק',
        ]:
            queries.insert(0, q)

    if 'מסע' in name and 'ויתקין' in winery:
        for q in [
            'Vitkin Masa Red wine bottle Israel',
            'ויתקין מסע אדום בקבוק יין',
            'vitkin-winery.com masa red bottle',
        ]:
            queries.insert(0, q)

    if 'tomasi' in name.lower() or 'טומסי' in name:
        variant = 'amarone classico' if 'המהולל' in name else 'il sestante amarone'
        for q in [
            f'Tommasi {variant} bottle',
            f'Tommasi {variant} wine bottle',
        ]:
            queries.insert(0, q)

    if 'קולומבארד' in name or 'קולומברד' in name:
        for q in [
            f'Adir Winery Colombard {years[0] if years else ""} bottle'.strip(),
            'אדיר קולומבארד בקבוק יין',
            'Adir Colombard white wine bottle Israel',
        ]:
            queries.insert(0, q)

    seen, out = set(), []
    for q in queries:
        q = re.sub(r'\s+', ' ', q).strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
    return out


HINT_EN = {
    'קברנה': ('cabernet', 'cab-sauv', 'cabernet-sauvignon'),
    'מרלו': ('merlot',),
    'שירז': ('shiraz', 'syrah'),
    'פטיט סירה': ('petit', 'sirah', 'syrah'),
    'סנסר': ('sancerre',),
    'שבלי': ('chablis',),
    'אמרונה': ('amarone',),
    'ססטנט': ('sestante', 'sestante'),
    'המהולל': ('amarone', 'classico'),
    'family collection': ('family', 'collection'),
    'מארה': ('mare', 'red'),
}


def _url_hints(wine):
    name = normalize_name(wine.get('name', '')).lower()
    hints = set()
    for he, tokens in HINT_EN.items():
        if he in name:
            hints.update(tokens)
    for token in re.split(r'[\s\-_/]+', name):
        if len(token) >= 4 and token.isascii():
            hints.add(token)
    return hints


def score_url(url, years=(), hints=()):
    u = url.lower()
    score = 0
    if any(g in u for g in GOOD):
        score += 60
    if any(b in u for b in BAD):
        score -= 300
    for year in years:
        if year in u:
            score += 45
    for hint in hints:
        h = hint.lower()
        if h in u:
            score += 35
    if any(w in u for w in ('bottle', 'wine', 'catalog/product', 'upload', 'product')):
        score += 8
    if u.endswith(('.jpg', '.jpeg', '.webp', '.png')):
        score += 3
    return score


def search_urls(query, years=(), hints=(), limit=20):
    urls = []
    with DDGS() as ddgs:
        for r in ddgs.images(query, max_results=limit):
            u = r.get('image') or r.get('thumbnail')
            if u:
                urls.append(u)
    ranked = sorted(dict.fromkeys(urls), key=lambda u: score_url(u, years, hints), reverse=True)
    return [u for u in ranked if score_url(u, years, hints) > 5]


def rank_urls(urls, years=(), hints=()):
    return sorted(dict.fromkeys(urls), key=lambda u: score_url(u, years, hints), reverse=True)


def save_image(data, dest):
    normalized = normalize_bottle_image(data)
    dest.write_bytes(normalized)


def download_image(url, dest):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.content
    if len(data) < 4000:
        raise ValueError('file too small')
    ok, info = is_wine_bottle(data)
    if not ok:
        raise ValueError(info)
    save_image(data, dest)
    ok2, info2 = is_wine_bottle(dest.read_bytes())
    if not ok2:
        dest.unlink(missing_ok=True)
        raise ValueError(f'saved image invalid: {info2}')
    return info2


def audit_wines(wines):
    bad = []
    for wine in wines:
        dest = IMG_DIR / wine_image_filename(wine)
        if not dest.exists():
            bad.append(wine)
            continue
        ok, _ = is_wine_bottle(dest.read_bytes())
        if not ok:
            bad.append(wine)
    return bad


def main():
    force = '--force' in sys.argv
    fix_bad = '--fix-bad' in sys.argv
    args = [a for a in sys.argv[1:] if a not in ('--force', '--fix-bad')]
    only_id = 0
    limit = 0
    offset = 0
    if len(args) == 1 and args[0].isdigit():
        only_id = int(args[0])
    elif len(args) >= 1 and args[0].isdigit():
        limit = int(args[0])
        if len(args) > 1 and args[1].isdigit():
            offset = int(args[1])

    IMG_DIR.mkdir(parents=True, exist_ok=True)

    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)

    cache = {}
    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text(encoding='utf-8'))

    wines = data['wines']
    if only_id:
        wines = [w for w in wines if w['id'] == only_id]
    elif fix_bad:
        wines = audit_wines(data['wines'])
        print(f'Re-fetching {len(wines)} non-bottle images')
        force = True
    else:
        wines = wines[offset:]
        if limit:
            wines = wines[:limit]

    ok = skip = fail = 0
    for wine in wines:
        wid = wine['id']
        dest = IMG_DIR / wine_image_filename(wine)
        years = extract_years(wine)

        manual = MANUAL_DIR / f'{wid}.jpg'
        named_manual = MANUAL_DIR / wine_image_filename(wine)
        if named_manual.exists():
            manual = named_manual
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

        if force and dest.exists():
            dest.unlink()

        cache_key = f'{wid}:{wine.get("name", "")}:{",".join(years)}'
        urls = [] if fix_bad else cache.get(cache_key, [])
        if isinstance(urls, str):
            urls = [urls]

        hints = _url_hints(wine)
        print(f'[{wid}] {wine["name"]} / {wine["winery"]}' + (f' ({years[0]})' if years else ''))

        if not urls:
            for q in build_queries(wine):
                print(f'  q: {q}')
                try:
                    found = search_urls(q, years=years, hints=hints)
                    urls.extend(found)
                    print(f'    +{len(found)} urls')
                except Exception as e:
                    print(f'    search error: {e}')
                urls = list(dict.fromkeys(urls))
                if len(urls) >= 18:
                    break
                time.sleep(0.8)
            cache[cache_key] = urls
            CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')

        urls = rank_urls(urls, years=years, hints=hints)
        saved = False
        for url in urls[:35]:
            try:
                info = download_image(url, dest)
                print(f'[{wid}] OK ({info})')
                ok += 1
                saved = True
                break
            except Exception as e:
                print(f'[{wid}] reject: {e}')
                continue

        if not saved:
            print(f'[{wid}] FAILED')
            fail += 1
        time.sleep(0.4)

    print(f'Done: {ok} downloaded, {skip} skipped, {fail} failed')


if __name__ == '__main__':
    main()
