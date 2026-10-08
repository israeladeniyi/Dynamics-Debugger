"""Generates the placeholder toolbar icons in public/icons (no dependencies).

The icon is a blue rounded square with three white timeline bars.
Run: python3 scripts/make-icons.py
"""
import struct
import zlib

BLUE = (0, 94, 184, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def pixel(x, y, n):
    r = n * 0.18
    # Rounded-corner mask.
    for cx, cy in ((r, r), (n - r, r), (r, n - r), (n - r, n - r)):
        if (x < r or x > n - r) and (y < r or y > n - r):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r and abs(x + 0.5 - cx) <= r and abs(y + 0.5 - cy) <= r:
                return CLEAR
    # Three bars of different lengths, like a timeline.
    bars = ((0.22, 0.30, 0.78), (0.45, 0.30, 0.62), (0.68, 0.30, 0.70))
    h = 0.12
    for top, left, right in bars:
        if top * n <= y < (top + h) * n and left * n <= x < right * n:
            return WHITE
    if 0.20 * n <= x < 0.25 * n and 0.20 * n <= y < 0.82 * n:
        return WHITE
    return BLUE


def png(n):
    raw = b''.join(b'\x00' + b''.join(bytes(pixel(x, y, n)) for x in range(n)) for y in range(n))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


for size in (16, 32, 48, 128):
    with open(f'public/icons/icon{size}.png', 'wb') as f:
        f.write(png(size))
