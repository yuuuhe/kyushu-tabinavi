"""icons/icon.svg と同じ図柄の PNG（192/512）を標準ライブラリだけで描く。"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"


def inside_tri(px, py, a, b, c):
    def s(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
    d1, d2, d3 = s((px, py), a, b), s((px, py), b, c), s((px, py), c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def color(x, y):  # 512 基準の座標
    if (x - 370) ** 2 + (y - 150) ** 2 <= 56 ** 2:
        return (251, 191, 36)
    if y <= 420 and (inside_tri(x, y, (40, 420), (200, 200), (360, 420)) or
                     inside_tri(x, y, (200, 420), (330, 220), (472, 420))):
        return (236, 253, 245)
    return (15, 118, 110)


def png(size):
    rows = []
    k = 512 / size
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row += bytes(color((x + 0.5) * k, (y + 0.5) * k))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", raw) + chunk(b"IEND", b""))


for n in (192, 512):
    (OUT / f"icon-{n}.png").write_bytes(png(n))
print("ok")
