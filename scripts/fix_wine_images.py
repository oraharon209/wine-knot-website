#!/usr/bin/env python3
"""Normalize existing wine images and report wines that need re-fetching."""

import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

from wine_bottle_validate import is_wine_bottle
from wine_image_names import wine_image_filename
from wine_image_normalize import (
    CANVAS_H,
    CANVAS_W,
    needs_background_removal,
    normalize_bottle_image,
)

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'wines_data.json'
IMG_DIR = ROOT / 'frontend' / 'public' / 'images' / 'wines'


REFETCH_REASONS = (
    'label crop',
    'too small',
    'no bottle detail',
    'scene/label crop',
    'missing',
    'flat graphic',
    'dark poster',
)


def _needs_refetch(reason):
    return any(r in reason for r in REFETCH_REASONS)


def audit(wines):
    refetch, normalize, ok = [], [], []
    for wine in wines:
        dest = IMG_DIR / wine_image_filename(wine)
        if not dest.exists():
            refetch.append((wine, 'missing'))
            continue
        data = dest.read_bytes()
        valid, reason = is_wine_bottle(data)
        if not valid and _needs_refetch(reason):
            refetch.append((wine, reason))
            continue
        if not valid or needs_background_removal(data) or dest.stat().st_size < 25000:
            normalize.append((wine, reason))
        else:
            ok.append((wine, reason))
    return refetch, normalize, ok


def normalize_all(wines, only_ids=None):
    done = skip = fail = 0
    for wine in wines:
        if only_ids and wine['id'] not in only_ids:
            continue
        dest = IMG_DIR / wine_image_filename(wine)
        if not dest.exists():
            fail += 1
            continue
        data = dest.read_bytes()
        _, reason = is_wine_bottle(data)
        if _needs_refetch(reason):
            skip += 1
            continue
        try:
            pre_ok, _ = is_wine_bottle(data)
            src = Image.open(BytesIO(data))
            out = normalize_bottle_image(data)
            ok, info = is_wine_bottle(out)
            if not ok:
                if pre_ok and info == 'no bottle detail' and src.size == (CANVAS_W, CANVAS_H):
                    dest.write_bytes(out)
                    print(f'[{wine["id"]}] OK (repadded, validator edge case)')
                    done += 1
                    continue
                print(f'[{wine["id"]}] normalize produced invalid: {info}')
                fail += 1
                continue
            dest.write_bytes(out)
            print(f'[{wine["id"]}] OK ({info})')
            done += 1
        except Exception as e:
            print(f'[{wine["id"]}] error: {e}')
            fail += 1
    return done, skip, fail


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        wines = json.load(f)['wines']

    if '--audit' in sys.argv:
        refetch, normalize, ok = audit(wines)
        print(f'OK (no change needed): {len(ok)}')
        print(f'Normalize: {len(normalize)}')
        print(f'Re-fetch: {len(refetch)}')
        for wine, reason in refetch:
            print(f'  [{wine["id"]}] {wine["name"]} — {reason}')
        return

    only_ids = None
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if args and args[0].isdigit():
        only_ids = {int(a) for a in args if a.isdigit()}

    refetch, to_norm, ok = audit(wines)
    print(f'Audit: {len(ok)} ok, {len(to_norm)} to normalize, {len(refetch)} need re-fetch')

    if '--normalize' in sys.argv or not any(
        a.startswith('--') for a in sys.argv[1:] if a != '--normalize'
    ):
        targets = wines if only_ids is None else [w for w in wines if w['id'] in only_ids]
        done, skip, fail = normalize_all(targets, only_ids)
        print(f'Normalized: {done}, skipped: {skip}, failed: {fail}')

    if refetch:
        print('\nWines needing re-fetch (run fetch_wine_images.py --force <id>):')
        for wine, reason in refetch:
            print(f'  {wine["id"]}')


if __name__ == '__main__':
    main()
