#!/usr/bin/env python3
"""Generate Mirror's app icon artwork (stdlib only, no PIL).

Mark: a ring with a gap and a centre dot, the same language as the attention ring.
Outputs (apps/mobile/assets):
  icon.png                      1024 px, full-bleed, legacy and iOS
  adaptive-icon.png              432 px, transparent foreground (safe zone 66%)
  adaptive-icon-monochrome.png   432 px, white silhouette for Android 13 themed icons
  notification/drawable-<d>/ic_stat_mirror.png   white silhouette, transparent, per density
Run: python3 scripts/assets/make-app-icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'mobile', 'assets')
BG = (17, 19, 24)          # #111318, deep ink (the dark canvas)
INK = (244, 244, 246)      # #F4F4F6, near white mark
SS = 4                     # supersampling per axis for anti-aliasing


def ring_coverage(x, y, cx, cy, r_out, thickness, gap_deg, dot_r):
    """Return coverage 0..1 for one sample point."""
    dx, dy = x - cx, y - cy
    d = math.hypot(dx, dy)
    if d <= dot_r:
        return 1.0
    r_in = r_out - thickness
    if r_in <= d <= r_out:
        # Angle measured clockwise from the top; leave a gap around 45 deg (top-right).
        ang = (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0
        centre, half = 45.0, gap_deg / 2.0
        diff = min(abs(ang - centre), 360.0 - abs(ang - centre))
        if diff <= half:
            return 0.0
        return 1.0
    return 0.0


def render(size, *, mark_scale, bg, fg, rounded=False):
    """Render one icon. mark_scale is the ring outer radius as a fraction of size."""
    cx = cy = size / 2.0
    r_out = mark_scale * size
    thickness = max(1.0, 0.30 * r_out)
    dot_r = 0.20 * r_out
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    acc += ring_coverage(x, y, cx, cy, r_out, thickness, 70.0, dot_r)
            a = acc / (SS * SS)
            if bg is None:
                row += bytes((fg[0], fg[1], fg[2], int(round(a * 255))))
            else:
                r = bg[0] * (1 - a) + fg[0] * a
                g = bg[1] * (1 - a) + fg[1] * a
                b = bg[2] * (1 - a) + fg[2] * a
                row += bytes((int(round(r)), int(round(g)), int(round(b)), 255))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b''.join(b'\x00' + r for r in rows)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def main():
    write_png(os.path.join(OUT, 'icon.png'), render(1024, mark_scale=0.34, bg=BG, fg=INK), 1024)
    write_png(os.path.join(OUT, 'adaptive-icon.png'), render(432, mark_scale=0.28, bg=None, fg=INK), 432)
    write_png(os.path.join(OUT, 'adaptive-icon-monochrome.png'), render(432, mark_scale=0.28, bg=None, fg=(255, 255, 255)), 432)
    # Notification small icon: white on transparent, sizes per Android density.
    for density, px in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
        path = os.path.join(OUT, 'notification', f'drawable-{density}', 'ic_stat_mirror.png')
        write_png(path, _small(px), px)


def _small(px):
    # Render at 4x then box-downsample to px, keeping alpha.
    big = render(px * 4, mark_scale=0.36, bg=None, fg=(255, 255, 255))
    rows = []
    for y in range(px):
        row = bytearray()
        for x in range(px):
            ra = ga = ba = aa = 0
            for dy in range(4):
                src = big[y * 4 + dy]
                for dx in range(4):
                    i = (x * 4 + dx) * 4
                    ra += src[i]
                    ga += src[i + 1]
                    ba += src[i + 2]
                    aa += src[i + 3]
            row += bytes((ra // 16, ga // 16, ba // 16, aa // 16))
        rows.append(bytes(row))
    return rows


def write_grain_ts():
    """Backdrop grain: a 64 px grey-noise tile at very low alpha, inlined as a data URI."""
    import base64
    w = h = 64
    rnd = os.urandom(w * h * 2)
    pix = bytearray()
    for i in range(w * h):
        pix += bytes((rnd[2 * i], rnd[2 * i + 1] % 40))
    raw = b''.join(b'\x00' + bytes(pix[y * w * 2:(y + 1) * w * 2]) for y in range(h))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 4, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'ui', 'src', 'grain.ts')
    with open(path, 'w') as f:
        f.write(
            "/**\n * Grain texture for the backdrop: a 64 px grey-noise tile at low alpha.\n"
            " * Generated by scripts/assets/make-app-icons.py (write_grain_ts). Inlined as a data URI so it\n"
            " * repeats the same on Android and iOS (the native 'repeat' resize mode is Android-only).\n */\n"
            f"export const GRAIN_TILE_PX = {w};\n"
            f"export const GRAIN_DATA_URI = 'data:image/png;base64,{base64.b64encode(png).decode()}';\n"
        )


if __name__ == '__main__':
    main()
    write_grain_ts()
    print('wrote icons to', os.path.normpath(OUT))
