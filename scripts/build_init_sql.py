#!/usr/bin/env python3
"""Build init.sql from wines_data.json."""

import json
import sys


def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace('\\', '\\\\').replace("'", "''") + "'"


def main():
    data_path = sys.argv[1] if len(sys.argv) > 1 else '/home/or/wine-knot/wines_data.json'
    out_path = sys.argv[2] if len(sys.argv) > 2 else '/home/or/wine-knot/backend/config/init.sql'

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
        '  out_of_stock TINYINT(1) NOT NULL DEFAULT 0,',
        '  FOREIGN KEY (category_id) REFERENCES categories(id)',
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

    lines.append(
        'INSERT INTO wines (name, category_id, winery, country, vintage, grape, '
        'rating, shelf_price, sale_price, notes, image_url, out_of_stock) VALUES'
    )
    wine_vals = []
    for w in data['wines']:
        cid = slug_to_id[w['category']]
        rating = w['rating'] if w.get('rating') is not None else 'NULL'
        wine_vals.append(
            f'  ({esc(w["name"])}, {cid}, {esc(w["winery"])}, {esc(w["country"])}, '
            f'{esc(w.get("vintage"))}, {esc(w.get("grape"))}, {rating}, '
            f'{w["shelf_price"]}, {w["sale_price"]}, {esc(w.get("notes"))}, '
            f'{esc(w.get("image_url"))}, 0)'
        )
    lines.append(',\n'.join(wine_vals) + ';')

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'Wrote {out_path} with {len(data["wines"])} wines')


if __name__ == '__main__':
    main()
