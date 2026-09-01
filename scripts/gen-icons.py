#!/usr/bin/env python3
"""Regenerates every app icon: a willow bat crossed behind the red ball.

Run from the project root:  python3 scripts/gen-icons.py
Outputs into icons/. Kept in the repo so the artwork is reproducible.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter


def layer(S):
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def bat(S):
    """An upright bat on its own layer, to be rotated into place."""
    L = layer(S)
    d = ImageDraw.Draw(L)

    bw, bh = int(S * 0.21), int(S * 0.66)
    bx, by = (S - bw) // 2, int(S * 0.24)

    # blade: willow gradient, lighter down the spine
    grad = layer(S)
    gd = ImageDraw.Draw(grad)
    for i in range(bw):
        t = abs(i - bw / 2) / (bw / 2)          # 0 at the spine, 1 at the edge
        col = (int(228 - 52 * t), int(185 - 52 * t), int(118 - 44 * t), 255)
        gd.line([(bx + i, by), (bx + i, by + bh)], fill=col)
    mask = layer(S)
    ImageDraw.Draw(mask).rounded_rectangle(
        [bx, by, bx + bw, by + bh], radius=int(bw * 0.42), fill=(255, 255, 255, 255))
    L.paste(grad, (0, 0), mask)

    # a soft toe shadow so the blade reads as curved
    toe = layer(S)
    ImageDraw.Draw(toe).ellipse(
        [bx - bw * 0.1, by + bh * 0.72, bx + bw * 1.1, by + bh * 1.06], fill=(96, 62, 30, 70))
    L = Image.alpha_composite(L, Image.composite(toe, layer(S), mask))

    # handle with grip bands
    hw, hh = int(bw * 0.42), int(S * 0.17)
    hx, hy = (S - hw) // 2, by - hh + int(S * 0.015)
    hd = ImageDraw.Draw(L)
    hd.rounded_rectangle([hx, hy, hx + hw, by + int(S * 0.02)],
                         radius=hw // 2, fill=(74, 48, 30, 255))
    for k in range(3):
        yy = hy + int(hh * (0.22 + k * 0.26))
        hd.line([(hx + 2, yy), (hx + hw - 2, yy)], fill=(112, 76, 46, 255),
                width=max(2, S // 160))
    return L


def ball(S, cx, cy, rad):
    """The red ball with seam and highlight, composited onto its own layer."""
    L = layer(S)
    d = ImageDraw.Draw(L)
    for i in range(int(rad), 0, -1):
        t = i / rad
        d.ellipse([cx - i, cy - i, cx + i, cy + i],
                  fill=(int(225 - 95 * t), int(48 - 26 * t), int(74 - 34 * t), 255))
    hi = layer(S)
    ImageDraw.Draw(hi).ellipse(
        [cx - rad * 0.62, cy - rad * 0.78, cx - rad * 0.02, cy - rad * 0.20],
        fill=(255, 190, 195, 115))
    L = Image.alpha_composite(L, hi.filter(ImageFilter.GaussianBlur(S * 0.02)))

    sd = ImageDraw.Draw(L)
    cream = (252, 247, 236, 255)
    pts = [(cx + math.cos(math.radians(k)) * rad * 0.26,
            cy + math.sin(math.radians(k)) * rad * 0.94) for k in range(-90, 91)]
    sd.line(pts, fill=cream, width=max(2, int(S * 0.010)), joint='curve')
    for j in range(6, len(pts) - 6, 13):
        x0, y0 = pts[j - 4]; x1, y1 = pts[j + 4]
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        x, y = pts[j]
        e = rad * 0.15
        sd.line([(x - nx * e, y - ny * e), (x + nx * e, y + ny * e)],
                fill=cream, width=max(2, int(S * 0.008)))
    return L


def make(size, pad_ratio, with_bg=True):
    S = size * 4
    img = layer(S)

    if with_bg:
        bg = layer(S)
        ImageDraw.Draw(bg).rounded_rectangle(
            [0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=(9, 15, 27, 255))
        img = Image.alpha_composite(img, bg)
        glow = layer(S)
        ImageDraw.Draw(glow).ellipse([-S * 0.45, -S * 0.50, S * 0.62, S * 0.55],
                                     fill=(16, 185, 129, 58))
        ImageDraw.Draw(glow).ellipse([S * 0.55, S * 0.60, S * 1.5, S * 1.5],
                                     fill=(56, 189, 248, 34))
        img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * 0.20)))
        mask = layer(S)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=(255, 255, 255, 255))
        img.putalpha(mask.split()[3])

    pad = pad_ratio  # how much of the frame the artwork may use, handled below

    # the bat leans at 28 degrees, handle top-left; the ball sits in front low-right
    scale = 1 - pad
    b = bat(S).rotate(28, resample=Image.BICUBIC, center=(S / 2, S / 2))
    if pad > 0.03:
        w2 = int(S * scale)
        b = b.resize((w2, w2), Image.LANCZOS)
        padded = layer(S)
        padded.paste(b, ((S - w2) // 2, (S - w2) // 2), b)
        b = padded
    shift = layer(S)
    shift.paste(b, (-int(S * 0.05), -int(S * 0.05)), b)
    img = Image.alpha_composite(img, shift)

    rad = S * 0.20 * scale
    img = Image.alpha_composite(
        img, ball(S, S * (0.5 + 0.235 * scale), S * (0.5 + 0.195 * scale), rad))

    return img.resize((size, size), Image.LANCZOS)


os.makedirs('icons', exist_ok=True)
make(192, 0.10).save('icons/icon-192.png')
make(512, 0.10).save('icons/icon-512.png')
make(512, 0.26).save('icons/maskable-512.png')
make(180, 0.10).save('icons/apple-touch-icon.png')
make(64, 0.02, with_bg=False).save('icons/favicon-64.png')
print('icons regenerated:', sorted(os.listdir('icons')))
