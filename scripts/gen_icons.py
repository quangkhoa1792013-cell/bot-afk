#!/usr/bin/env python3
import struct, zlib, sys
from pathlib import Path

def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def make_png(size: int, pixel_fn) -> bytes:
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            raw += bytes(pixel_fn(x, y, size))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(raw, 9))
            + png_chunk(b"IEND", b""))

BG_DARK = (23, 26, 38)
BG_EDGE = (43, 49, 70)
GRASS = (61, 220, 132)
GRASS_D = (40, 160, 100)
DIRT = (140, 96, 60)
DIRT_D = (110, 74, 46)
ACCENT = (91, 140, 255)

def rounded_rect(x, y, s, r):
    if x < r and y < r and (x - r) ** 2 + (y - r) ** 2 > r * r:
        return False
    if x >= s - r and y < r and (s - 1 - x - r) ** 2 + (y - r) ** 2 > r * r:
        return False
    if x < r and y >= s - r and (x - r) ** 2 + (y - r) ** 2 > r * r:
        return False
    if x >= s - r and y >= s - r and (s - 1 - x - r) ** 2 + (y - r) ** 2 > r * r:
        return False
    return True

def pixel(x, y, s):
    r = int(s * 0.18)
    if not rounded_rect(x, y, s, r):
        return (0, 0, 0, 0)

    u, v = x / s, y / s
    base = BG_DARK if (x + y) % 2 == 0 else BG_EDGE
    alpha = 255

    cube_l = 0.24
    cube_r = 0.76
    split = 0.52
    inside = cube_l <= u <= cube_r and cube_l <= v <= cube_r

    if not inside:
        if abs(u - v) <= 0.02 and ACCENT[0] * 0.9 < x * 0.7:
            pass
        return (*base, alpha)

    top_face = (u - cube_l) + (v - cube_l) < (cube_r - cube_l) * (split - cube_l) * 2.4
    if v < split:
        col = GRASS if ((u * 17 + v * 13) % 5 > 1.5) else GRASS_D
    else:
        col = DIRT if ((u * 19 + v * 11) % 5 > 1.5) else DIRT_D

    edge = min(u - cube_l, cube_r - u, v - cube_l, cube_r - v)
    if edge < 0.015:
        col = tuple(min(255, c + 45) for c in col)

    return (*col, 255)

def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("crates/minebot-gui/icons")
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, size in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
        data = make_png(size, pixel)
        (out_dir / name).write_bytes(data)
        print(f"wrote {out_dir / name} ({size}x{size})")

if __name__ == "__main__":
    main()
