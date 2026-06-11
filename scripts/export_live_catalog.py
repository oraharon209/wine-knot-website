#!/usr/bin/env python3
"""Export live MySQL catalog to wines_data.json (prices, stock, favorites, image paths)."""

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


def local_image_url(url):
    if not url:
        return ''
    if url.startswith('/images/wines/'):
        return url
    if url.startswith('http://') or url.startswith('https://'):
        return f'/images/wines/{Path(urlparse(url).path).name}'
    name = Path(url).name
    return f'/images/wines/{name}' if name else ''


def export_catalog(conn, out_path):
    cur = conn.cursor(dictionary=True)

    cur.execute('SELECT slug, name_he FROM categories ORDER BY sort_order, id')
    categories = [{'slug': row['slug'], 'name_he': row['name_he']} for row in cur.fetchall()]

    cur.execute(
        '''SELECT w.id, w.name, c.slug AS category, c.name_he AS category_he,
                  w.winery, w.country, w.vintage, w.grape, w.rating,
                  w.shelf_price, w.sale_price, w.notes, w.image_url,
                  w.out_of_stock, w.image_version
           FROM wines w
           JOIN categories c ON c.id = w.category_id
           ORDER BY w.id'''
    )
    wines = []
    for row in cur.fetchall():
        rating = row['rating']
        if rating is not None:
            rating = float(rating)
        wines.append({
            'id': row['id'],
            'name': row['name'],
            'category': row['category'],
            'category_he': row['category_he'],
            'winery': row['winery'] or '',
            'country': row['country'] or '',
            'vintage': row['vintage'] or '',
            'grape': row['grape'] or '',
            'rating': rating,
            'shelf_price': float(row['shelf_price']),
            'sale_price': float(row['sale_price']),
            'notes': row['notes'] or '',
            'image_url': local_image_url(row['image_url']),
            'out_of_stock': bool(row['out_of_stock']),
            'image_version': int(row['image_version'] or 0),
        })

    cur.execute(
        'SELECT wine_id FROM recommended_wines ORDER BY sort_order ASC, wine_id ASC'
    )
    recommended_wine_ids = [row['wine_id'] for row in cur.fetchall()]

    data = {
        'categories': categories,
        'wines': wines,
        'recommended_wine_ids': recommended_wine_ids,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    cur.close()
    print(f'Wrote {out_path} — {len(wines)} wines, {len(recommended_wine_ids)} recommended')


def main():
    out_path = ROOT / 'wines_data.json'
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if args:
        out_path = Path(args[0])

    try:
        import mysql.connector
    except ImportError:
        print('Install mysql-connector-python: .venv/bin/pip install mysql-connector-python', file=sys.stderr)
        sys.exit(1)

    conn = mysql.connector.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', '3306')),
        user=os.environ.get('DB_USER', 'wineknot'),
        password=os.environ.get('DB_PASSWORD', 'wineknot_pass'),
        database=os.environ.get('DB_NAME', 'wineknot'),
        charset='utf8mb4',
    )
    try:
        export_catalog(conn, out_path)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
