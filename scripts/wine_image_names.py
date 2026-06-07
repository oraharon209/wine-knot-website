#!/usr/bin/env python3
"""Build human-readable wine image filenames from wine records."""
import re


def normalize(text):
    return re.sub(r'\s+', ' ', (text or '').strip())


def winery_short(winery):
    w = normalize((winery or '').split('/')[0].split('(')[0])
    return re.sub(r'["\']', '', w).strip()


def extract_years(wine):
    years = []
    vintage = wine.get('vintage')
    if vintage:
        years.append(str(vintage).strip())
    years.extend(re.findall(r'20\d{2}|19\d{2}', wine.get('name', '')))
    seen, out = set(), []
    for y in years:
        if y not in seen:
            seen.add(y)
            out.append(y)
    return out


def wine_image_label(wine):
    """Filename stem: 'יקב - שם היין' with year when not already in the name."""
    winery = winery_short(wine.get('winery', ''))
    name = normalize(wine.get('name', '')).rstrip(',').strip()
    years = extract_years(wine)
    name_has_year = bool(re.search(r'20\d{2}|19\d{2}', name))

    label = f'{winery} - {name}' if winery else name
    if years and not name_has_year:
        label = f'{label} {years[0]}'

    label = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', label)
    return normalize(label)


def wine_image_filename(wine, used=None):
    stem = wine_image_label(wine)
    filename = f'{stem}.jpg'
    if used is not None:
        if filename in used:
            filename = f'{stem} ({wine["id"]}).jpg'
        used.add(filename)
    return filename


def wine_image_url(wine, used=None):
    return f'/images/wines/{wine_image_filename(wine, used)}'


def assign_image_urls(wines):
    used = set()
    for wine in wines:
        wine['image_url'] = wine_image_url(wine, used)
    return wines
