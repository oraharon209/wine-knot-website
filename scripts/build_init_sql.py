#!/usr/bin/env python3
"""Build init.sql from wines_data.json."""

import json
import sys
from pathlib import Path


def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace('\\', '\\\\').replace("'", "''") + "'"


def main():
    root = Path(__file__).resolve().parent.parent
    data_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'wines_data.json'
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'backend/config/init.sql'

    with open(data_path, encoding='utf-8') as f:
        data = json.load(f)

    lines = [
        'SET NAMES utf8mb4;',
        'CREATE DATABASE IF NOT EXISTS wineknot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
        'USE wineknot;',
        '',
        'CREATE TABLE IF NOT EXISTS categories (',
        '  id INT AUTO_INCREMENT PRIMARY KEY,',
        '  slug VARCHAR(50) NOT NULL UNIQUE,',
        '  name_he VARCHAR(100) NOT NULL,',
        '  sort_order INT NOT NULL DEFAULT 0',
        ');',
        '',
        'CREATE TABLE IF NOT EXISTS wines (',
        '  id INT AUTO_INCREMENT PRIMARY KEY,',
        '  name VARCHAR(255) NOT NULL,',
        '  category_id INT NOT NULL,',
        '  winery VARCHAR(255),',
        '  country VARCHAR(100),',
        '  vintage VARCHAR(10),',
        '  grape VARCHAR(100),',
        '  rating DECIMAL(4,1),',
        '  shelf_price DECIMAL(10,2) NOT NULL,',
        '  sale_price DECIMAL(10,2) NOT NULL,',
        '  notes TEXT,',
        '  image_url VARCHAR(500),',
        '  image_version BIGINT UNSIGNED NOT NULL DEFAULT 0,',
        '  out_of_stock TINYINT(1) NOT NULL DEFAULT 0,',
        '  FOREIGN KEY (category_id) REFERENCES categories(id)',
        ');',
        '',
        'CREATE TABLE IF NOT EXISTS recommended_wines (',
        '  wine_id INT NOT NULL PRIMARY KEY,',
        '  sort_order INT NOT NULL DEFAULT 0,',
        '  FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE',
        ');',
        '',
        'INSERT INTO categories (slug, name_he, sort_order) VALUES',
    ]

    cat_vals = []
    for i, c in enumerate(data['categories']):
        cat_vals.append(f'  ({esc(c["slug"])}, {esc(c["name_he"])}, {i + 1})')
    lines.append(',\n'.join(cat_vals) + ';')
    lines.append('')

    slug_to_id = {c['slug']: i + 1 for i, c in enumerate(data['categories'])}

    has_ids = all(w.get('id') for w in data['wines'])
    wine_cols = (
        'id, name, category_id, winery, country, vintage, grape, '
        'rating, shelf_price, sale_price, notes, image_url, image_version, out_of_stock'
        if has_ids
        else 'name, category_id, winery, country, vintage, grape, '
        'rating, shelf_price, sale_price, notes, image_url, image_version, out_of_stock'
    )
    lines.append(f'INSERT INTO wines ({wine_cols}) VALUES')
    wine_vals = []
    max_id = 0
    for w in data['wines']:
        cid = slug_to_id[w['category']]
        rating = w['rating'] if w.get('rating') is not None else 'NULL'
        oos = 1 if w.get('out_of_stock') else 0
        image_version = int(w.get('image_version') or 0)
        wine_id = w.get('id')
        if wine_id:
            max_id = max(max_id, int(wine_id))
        prefix = f'{wine_id}, ' if has_ids else ''
        wine_vals.append(
            f'  ({prefix}{esc(w["name"])}, {cid}, {esc(w["winery"])}, {esc(w["country"])}, '
            f'{esc(w.get("vintage"))}, {esc(w.get("grape"))}, {rating}, '
            f'{w["shelf_price"]}, {w["sale_price"]}, {esc(w.get("notes"))}, '
            f'{esc(w.get("image_url"))}, {image_version}, {oos})'
        )
    lines.append(',\n'.join(wine_vals) + ';')
    if has_ids and max_id:
        lines.append(f'ALTER TABLE wines AUTO_INCREMENT = {max_id + 1};')

    recommended = data.get('recommended_wine_ids') or []
    if recommended:
        lines.append('')
        lines.append('INSERT INTO recommended_wines (wine_id, sort_order) VALUES')
        rec_vals = [
            f'  ({wine_id}, {i})'
            for i, wine_id in enumerate(recommended)
        ]
        lines.append(',\n'.join(rec_vals) + ';')

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    rec_n = len(recommended)
    print(f'Wrote {out_path} with {len(data["wines"])} wines, {rec_n} recommended')


if __name__ == '__main__':
    main()
