#!/usr/bin/env python3
"""Import wines from Excel price list into wines_data.json."""
import json
import re
import sys
from pathlib import Path

import openpyxl

from wine_image_names import assign_image_urls

ROOT = Path(__file__).resolve().parent.parent
EXCEL_DEFAULT = Path('/home/or/Downloads/מחירון מעודכן יוני 2026.xlsx')

CAT_HEADERS = {
    'לבנים': ('white', 'לבן'),
    'נתזים': ('sparkling', 'נתזים ושמפניות'),
    'רוזה': ('rose', 'רוזה'),
    'מתוקים': ('sweet', 'מתוקים'),
    'אדומים עד': ('red', 'אדום'),
    'אדומים פרימיום': ('red_premium', 'אדום פרימיום'),
    'יינות חול': ('international', 'יינות חוץ לארץ'),
    'סופר פרימיום': ('super_premium', 'סופר פרימיום'),
}

CATEGORIES = [
    {'slug': 'white', 'name_he': 'לבן'},
    {'slug': 'sparkling', 'name_he': 'נתזים ושמפניות'},
    {'slug': 'rose', 'name_he': 'רוזה'},
    {'slug': 'sweet', 'name_he': 'מתוקים'},
    {'slug': 'red', 'name_he': 'אדום'},
    {'slug': 'red_premium', 'name_he': 'אדום פרימיום'},
    {'slug': 'international', 'name_he': 'יינות חוץ לארץ'},
    {'slug': 'super_premium', 'name_he': 'סופר פרימיום'},
]


def cat_from_header(name):
    if not name:
        return None
    text = str(name)
    for key, val in CAT_HEADERS.items():
        if key in text:
            return val
    return None


def clean_notes(raw):
    if not raw:
        return ''
    text = str(raw).strip()
    if re.search(r'\.(jpg|jpeg|png)', text, re.I) or 'לינקים' in text:
        return ''
    return text


def parse_excel(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb['הזמנה ממוכנת לפי סוגי יינות']
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    current = None
    current_he = None
    wines = []
    wid = 1

    for row in rows:
        row = list(row) + [None] * 8
        rating, notes, sale, shelf, name, winery = row[:6]

        if sale == 'מבצע':
            parsed = cat_from_header(name)
            if parsed:
                current, current_he = parsed
            continue

        if not current or not isinstance(sale, (int, float)) or not name or not winery:
            continue

        name_s = str(name).strip()
        winery_s = str(winery).strip()
        skip_words = ('כוסות', 'קאראף', 'משאבת', 'מחדרר', 'מקרר', 'מתנה', 'SMS')
        if any(w in name_s or w in winery_s for w in skip_words):
            continue

        vintage_match = re.search(r'\b(19|20)\d{2}\b', name_s)
        vintage = vintage_match.group(0) if vintage_match else ''

        wines.append({
            'id': wid,
            'name': name_s,
            'category': current,
            'category_he': current_he,
            'winery': winery_s,
            'country': 'ישראל' if current not in ('international', 'super_premium') else '',
            'vintage': vintage,
            'grape': '',
            'rating': float(rating) if isinstance(rating, (int, float)) else None,
            'shelf_price': int(shelf) if isinstance(shelf, (int, float)) else int(sale),
            'sale_price': int(sale),
            'notes': clean_notes(notes),
        })
        wid += 1

    wines = assign_image_urls(wines)
    return {'categories': CATEGORIES, 'wines': wines}


def main():
    excel_path = Path(sys.argv[1]) if len(sys.argv) > 1 else EXCEL_DEFAULT
    out_path = ROOT / 'wines_data.json'
    data = parse_excel(excel_path)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Imported {len(data["wines"])} wines -> {out_path}')


if __name__ == '__main__':
    main()
