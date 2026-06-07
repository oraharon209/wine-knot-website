#!/usr/bin/env python3
"""Rename numeric wine images to descriptive Hebrew filenames."""
import json
import shutil
from pathlib import Path

from wine_image_names import assign_image_urls, wine_image_filename

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'wines_data.json'
IMG_DIR = ROOT / 'frontend' / 'public' / 'images' / 'wines'
MANUAL_DIR = ROOT / 'scripts' / 'manual_images'


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)

    used = set()
    renames = []
    for wine in data['wines']:
        wid = wine['id']
        new_name = wine_image_filename(wine, used)
        new_path = IMG_DIR / new_name
        old_path = IMG_DIR / f'{wid}.jpg'
        manual_path = MANUAL_DIR / f'{wid}.jpg'

        src = None
        if manual_path.exists():
            src = manual_path
        elif old_path.exists():
            src = old_path
        elif new_path.exists():
            src = new_path

        wine['image_url'] = f'/images/wines/{new_name}'
        if src and src.resolve() != new_path.resolve():
            renames.append((src, new_path, wine))

    # Remove stale numeric/id files after rename
    for src, dest, wine in renames:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest.unlink()
        shutil.copy2(src, dest)
        print(f"[{wine['id']}] -> {dest.name}")

    for old in IMG_DIR.glob('[0-9]*.jpg'):
        old.unlink()
        print(f"removed {old.name}")

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'Updated {len(data["wines"])} image_url entries in wines_data.json')


if __name__ == '__main__':
    main()
