#!/usr/bin/env python3
"""Generate wines_data.json with 177 Hebrew wines across 8 categories."""

import json
import random

random.seed(42)

CATEGORIES = [
    {'slug': 'white', 'name_he': 'לבן', 'count': 46},
    {'slug': 'sparkling', 'name_he': 'נתזים ושמפניות', 'count': 5},
    {'slug': 'rose', 'name_he': 'רוזה', 'count': 5},
    {'slug': 'sweet', 'name_he': 'מתוקים', 'count': 5},
    {'slug': 'red', 'name_he': 'אדום', 'count': 55},
    {'slug': 'red_premium', 'name_he': 'אדום פרימיום', 'count': 32},
    {'slug': 'international', 'name_he': 'יינות חוץ לארץ', 'count': 26},
    {'slug': 'super_premium', 'name_he': 'סופר פרימיום', 'count': 3},
]

WINERIES_IL = [
    'יקב רמת הגולן',
    'יקב גולן',
    'יקב ירדן',
    'יקב רמת נגב',
    'יקב פסגות',
    'יקב טוליפ',
    'יקב רקנאטי',
    'יקב דלתון',
    'יקב ברקן',
    'יקב כרמל',
    'יקב בנימינה',
    'יקב טפרברג',
    'יקב דלתון',
    'יקב שילה',
    'יקב קסטל',
    'יקב עמק האלה',
    'יקב מוני',
    'יקב רוטשילד',
    'יקב קטן',
    'יקב סגל',
]

WINERIES_INT = [
    'Château Margaux',
    'Domaine de la Romanée',
    'Antinori',
    'Penfolds',
    'Opus One',
    'Cloudy Bay',
    'Moët & Chandon',
    'Veuve Clicquot',
    'Barolo DOCG',
    'Rioja Gran Reserva',
    'Bordeaux Supérieur',
    'Napa Valley',
]

GRAPES_IL = [
    'שרדונה',
    'סוביניון בלאן',
    'קברנה סוביניון',
    'מרלו',
    'סירה',
    'פטיט סירה',
    'קברנה פרנק',
    'רוסאן',
    'ויונייה',
    'גמאי',
    'מוסקט',
    'ריזלינג',
    'גוורצטרמינר',
    'פינו נואר',
    'קאריניאן',
]

GRAPES_INT = [
    'Bordeaux Blend',
    'Pinot Noir',
    'Chardonnay',
    'Sauvignon Blanc',
    'Tempranillo',
    'Nebbiolo',
    'Shiraz',
    'Malbec',
    'Riesling',
    'Prosecco',
]

VINTAGES = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']

NOTES = [
    'יין עשיר ומאוזן',
    'ארומטי עם ניחוחות פירות',
    'גוף מלא וטאנינים רכים',
    'רענן וקליל',
    'מורכב ואלגנטי',
    'מתאים לבשר אדום',
    'מושלם לדגים',
    'יין קיצי מצוין',
    'עם נגיעות עץ ותבלינים',
    'ארומה פרחונית',
    'יין מיוחד לחגים',
    'מומלץ מאוד',
    'בקבוק מיוחד',
    'יין איקוני',
]


def price_range(slug):
    ranges = {
        'white': (45, 180),
        'sparkling': (80, 350),
        'rose': (50, 150),
        'sweet': (55, 200),
        'red': (40, 160),
        'red_premium': (120, 450),
        'international': (90, 600),
        'super_premium': (500, 2500),
    }
    return ranges[slug]


def make_wine(wid, cat):
    slug = cat['slug']
    is_int = slug in ('international', 'super_premium')
    winery = random.choice(WINERIES_INT if is_int else WINERIES_IL)
    grape = random.choice(GRAPES_INT if is_int else GRAPES_IL)
    vintage = random.choice(VINTAGES)
    lo, hi = price_range(slug)
    shelf = round(random.uniform(lo, hi), 0)
    discount = random.choice([0, 0, 0, 5, 10, 15, 20, 25])
    sale = round(shelf * (1 - discount / 100), 0) if discount else shelf
    rating = round(random.uniform(85, 98.5), 1)
    if slug == 'super_premium':
        rating = round(random.uniform(94, 99), 1)

    name = f'{winery} {grape} {vintage}'
    country = (
        'צרפת'
        if is_int and 'Château' in winery or 'Domaine' in winery or 'Bordeaux' in grape
        else (
            'איטליה'
            if is_int and ('Antinori' in winery or 'Barolo' in winery)
            else (
                'אוסטרליה'
                if is_int and 'Penfolds' in winery
                else (
                    'ארה"ב'
                    if is_int and ('Opus' in winery or 'Napa' in winery)
                    else (
                        'ניו זילנד'
                        if is_int and 'Cloudy' in winery
                        else (
                            'ספרד'
                            if is_int and 'Rioja' in winery
                            else (
                                'ישראל'
                                if not is_int
                                else random.choice(['צרפת', 'איטליה', 'ספרד', 'ארה"ב'])
                            )
                        )
                    )
                )
            )
        )
    )

    return {
        'id': wid,
        'name': name,
        'category': slug,
        'category_he': cat['name_he'],
        'winery': winery,
        'country': country,
        'vintage': vintage,
        'grape': grape,
        'rating': rating,
        'shelf_price': int(shelf),
        'sale_price': int(sale),
        'notes': random.choice(NOTES),
    }


def main():
    wines = []
    wid = 1
    for cat in CATEGORIES:
        for _ in range(cat['count']):
            wines.append(make_wine(wid, cat))
            wid += 1

    out = {'categories': CATEGORIES, 'wines': wines}
    with open('/home/or/wine-knot/wines_data.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'Generated {len(wines)} wines')


if __name__ == '__main__':
    main()
