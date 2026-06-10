#!/usr/bin/env python3
"""Heuristics to detect wine bottle product photos vs posters/scenes/graphics."""

from io import BytesIO

from PIL import Image, ImageFilter, ImageStat


def _lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def _q(px, levels=12):
    r, g, b = px
    step = 256 // levels
    return (r // step * step, g // step * step, b // step * step)


def _edge_sharpness(img):
    gray = img.convert('L')
    edges = gray.filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(edges).mean[0]


def is_wine_bottle(data):
    """Return (ok, reason). Expects e-commerce bottle shots."""
    img = Image.open(BytesIO(data)).convert('RGB')
    w, h = img.size

    if w < 200 or h < 350:
        return False, f'too small {w}x{h}'

    aspect = h / w
    if aspect < 1.05:
        return False, f'not portrait {w}x{h}'

    if aspect < 1.15 and max(w, h) < 700:
        return False, f'square thumbnail {w}x{h}'

    if aspect < 1.4 and w < 550:
        return False, f'label crop {w}x{h}'

    target_w = 100
    target_h = max(100, int(target_w * aspect))
    samp = img.resize((target_w, target_h))
    sw, sh = samp.size

    def px(x, y):
        return samp.getpixel((max(0, min(sw - 1, x)), max(0, min(sh - 1, y))))

    pixels = [_q(p) for p in samp.getdata()]
    unique = len(set(pixels))

    if unique < 12:
        return False, 'flat graphic'

    corners = [px(2, 2), px(sw - 3, 2), px(2, sh - 3), px(sw - 3, sh - 3)]
    corner_lum = [_lum(*c) for c in corners]
    avg_corner = sum(corner_lum) / 4
    light_corners = sum(1 for lum_val in corner_lum if lum_val > 185)

    ys = list(range(sh // 5, 4 * sh // 5, max(1, sh // 20)))
    left_lum = sum(_lum(*px(5, y)) for y in ys) / len(ys)
    right_lum = sum(_lum(*px(sw - 6, y)) for y in ys) / len(ys)
    center_lum = sum(_lum(*px(sw // 2, y)) for y in ys) / len(ys)
    avg_side = (left_lum + right_lum) / 2

    center_colors = len({_q(px(sw // 2, y)) for y in range(0, sh, max(1, sh // 16))})

    top_ys = range(0, sh // 6)
    bottom_ys = range(5 * sh // 6, sh)
    top_lum = sum(_lum(*px(sw // 2, y)) for y in top_ys) / max(1, len(list(top_ys)))
    bottom_lum = sum(_lum(*px(sw // 2, y)) for y in bottom_ys) / max(1, len(list(bottom_ys)))

    light_bg = light_corners >= 3 and avg_corner > 175

    if avg_corner < 75 and center_lum < 95:
        return False, 'dark poster/scene'
    if not light_bg and unique > 220:
        return False, f'busy background ({unique})'
    if light_bg and unique > 280:
        return False, f'too busy for product ({unique})'

    if center_colors < 6:
        return False, 'no bottle detail'

    if top_lum < 165 and bottom_lum < 165 and aspect < 1.5:
        return False, 'label crop (no bottle margins)'

    if not light_bg and avg_side < 140 and center_lum > avg_side + 25:
        return False, 'scene/label crop'

    sharpness = _edge_sharpness(img.resize((min(400, w), min(int(400 * aspect), h))))
    if sharpness < 6 and min(w, h) < 350:
        return False, f'blurry {w}x{h}'

    if light_bg:
        return True, f'product {w}x{h}'

    if aspect >= 1.25 and center_colors >= 7 and unique < 320:
        return True, f'bottle {w}x{h} (needs bg cleanup)'

    return False, 'not a bottle shot'
