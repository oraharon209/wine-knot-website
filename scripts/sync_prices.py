#!/usr/bin/env python3
"""Sync shelf_price and sale_price from wines_data.json into MySQL."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def esc(s):
    return str(s).replace('\\', '\\\\').replace("'", "''")


def build_sql(wines):
    lines = ['SET NAMES utf8mb4;']
    for w in wines:
        lines.append(
            'UPDATE wines '
            f"SET shelf_price={w['shelf_price']}, sale_price={w['sale_price']} "
            f"WHERE name='{esc(w['name'])}' AND winery='{esc(w['winery'])}';"
        )
    return '\n'.join(lines) + '\n'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_path = Path(args[0]) if args else ROOT / 'wines_data.json'
    with open(data_path, encoding='utf-8') as f:
        wines = json.load(f)['wines']

    sql = build_sql(wines)
    if '--sql-only' in sys.argv:
        sys.stdout.write(sql)
        return

    try:
        import mysql.connector
    except ImportError:
        sys.stdout.write(sql)
        return

    conn = mysql.connector.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=int(os.environ.get('DB_PORT', '3306')),
        user=os.environ.get('DB_USER', 'wineknot'),
        password=os.environ.get('DB_PASSWORD', 'wineknot_pass'),
        database=os.environ.get('DB_NAME', 'wineknot'),
        charset='utf8mb4',
    )
    cur = conn.cursor()
    updated = 0
    for w in wines:
        cur.execute(
            'UPDATE wines SET shelf_price=%s, sale_price=%s WHERE name=%s AND winery=%s',
            (w['shelf_price'], w['sale_price'], w['name'], w['winery']),
        )
        updated += cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    print(f'Updated prices for {updated} wines')


if __name__ == '__main__':
    main()
