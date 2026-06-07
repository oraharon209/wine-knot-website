#!/usr/bin/env python3
"""Sync image filenames and image_url fields with current wine metadata."""
import json
import shutil
from pathlib import Path

from wine_image_names import assign_image_urls, wine_image_filename

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'wines_data.json'
IMG_DIR = ROOT / 'frontend' / 'public' / 'images' / 'wines'


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)

    by_url = {}
    for path in IMG_DIR.glob('*.jpg'):
        by_url[f'/images/wines/{path.name}'] = path

    used = set()
    for wine in data['wines']:
        new_name = wine_image_filename(wine, used)
        new_url = f'/images/wines/{new_name}'
        old_url = wine.get('image_url', '')
        wine['image_url'] = new_url

        old_path = by_url.get(old_url)
        new_path = IMG_DIR / new_name
        if old_path and old_path != new_path:
            if new_path.exists():
                new_path.unlink()
            old_path.rename(new_path)
            by_url.pop(old_url, None)
            by_url[new_url] = new_path
            print(f"[{wine['id']}] {old_path.name} -> {new_name}")

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Synced wines_data.json')


if __name__ == '__main__':
    main()
