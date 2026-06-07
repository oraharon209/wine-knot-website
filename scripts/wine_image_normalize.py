#!/usr/bin/env python3
"""Normalize wine bottle photos to a clean white-background product shot."""
from io import BytesIO

from PIL import Image

CANVAS_W = 600
CANVAS_H = 900
BG = (255, 255, 255)
PADDING = 0.08

_rembg = None


def _get_rembg():
    global _rembg
    if _rembg is None:
        from rembg import remove
        _rembg = remove
    return _rembg


def _trim_transparent(img):
    if img.mode != 'RGBA':
        return img
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def _fit_on_canvas(img):
    inner_w = int(CANVAS_W * (1 - 2 * PADDING))
    inner_h = int(CANVAS_H * (1 - 2 * PADDING))
    w, h = img.size
    scale = min(inner_w / w, inner_h / h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (CANVAS_W, CANVAS_H), BG)
    x = (CANVAS_W - new_w) // 2
    y = (CANVAS_H - new_h) // 2
    if resized.mode == 'RGBA':
        canvas.paste(resized, (x, y), resized)
    else:
        canvas.paste(resized, (x, y))
    return canvas


def needs_background_removal(data):
    img = Image.open(BytesIO(data)).convert('RGB')
    w, h = img.size
    aspect = h / max(w, 1)
    samp = img.resize((80, max(80, int(80 * aspect))))
    sw, sh = samp.size

    def lum(px):
        return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]

    corners = [
        samp.getpixel((2, 2)),
        samp.getpixel((sw - 3, 2)),
        samp.getpixel((2, sh - 3)),
        samp.getpixel((sw - 3, sh - 3)),
    ]
    corner_lums = [lum(c) for c in corners]
    return sum(1 for l in corner_lums if l > 185) < 3


def normalize_bottle_image(data, remove_bg=None):
    """Return JPEG bytes for a standardized bottle product shot."""
    if remove_bg is None:
        remove_bg = needs_background_removal(data)

    img = Image.open(BytesIO(data)).convert('RGBA' if remove_bg else 'RGB')

    if remove_bg:
        out = _get_rembg()(img)
        out = _trim_transparent(out)
    else:
        out = img.convert('RGB')
        bbox = out.getbbox()
        if bbox:
            out = out.crop(bbox)

    result = _fit_on_canvas(out)
    buf = BytesIO()
    result.save(buf, 'JPEG', quality=92)
    return buf.getvalue()
