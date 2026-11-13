#!/usr/bin/env python3
"""Tekee VT323-fontista sileän version Terävälle ilmeelle.

VT323 on piirretty juovina: jokainen merkki on 80 yksikön korkuisia vaakarivejä,
ja vinot viivat ovat portaita. Tämä piirtää jokaisen merkin kuvaksi, pehmentää
kuvan (pystysuunnassa rivin verran, vaakasuunnassa vähän) ja jäljittää
puolivälin tasa-arvokäyrän uudeksi ääriviivaksi. Suorat reunat pysyvät
paikallaan, portaat suoristuvat vinoviivoiksi ja kulmat pyöristyvät vähän.
Merkkien leveydet ja rivikorkeus ovat samat kuin VT323:ssa, joten asettelu ei
muutu, kun fontti vaihtuu ilmeen mukana.

Käyttö (riippuvuudet: fonttools, brotli, numpy, pillow):
    python3 scripts/fontti/sileafontti.py

Lähde: @fontsource/vt323 (SIL Open Font License 1.1). Tulos on saman lisenssin
alainen johdannainen eri nimellä (Lunki Sileä).
"""
from pathlib import Path

import numpy as np
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/client/node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2"
TARGET = ROOT / "packages/client/src/assets/lunki-silea.woff2"
NAME = "Lunki Silea"

# Kuvan tarkkuus: yksi kuvapiste on näin monta fonttiyksikköä.
UNIT = 5
# Pehmennyksen leveys fonttiyksikköinä: pysty rivin (80) mukaan, vaaka kapea.
SIGMA_Y = 36
SIGMA_X = 16
# Ääriviivan yksinkertaistus (fonttiyksikköä).
TOLERANCE = 1.6
MARGIN = 100


def flatten(pen_value):
    """Ääriviivat murtoviivoiksi (toisen asteen kaaret viidellä pisteellä)."""
    contours, cur = [], []
    for op, args in pen_value:
        if op == "moveTo":
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "qCurveTo":
            pts = list(args)
            p0 = cur[-1]
            # Peräkkäisten ohjauspisteiden välissä on näkymätön käyräpiste.
            for i, c in enumerate(pts[:-1]):
                end = pts[i + 1] if i == len(pts) - 2 else ((c[0] + pts[i + 1][0]) / 2, (c[1] + pts[i + 1][1]) / 2)
                for t in (0.2, 0.4, 0.6, 0.8, 1.0):
                    a = (1 - t) ** 2
                    b = 2 * t * (1 - t)
                    cur.append((a * p0[0] + b * c[0] + t * t * end[0], a * p0[1] + b * c[1] + t * t * end[1]))
                p0 = end
        elif op in ("closePath", "endPath"):
            if len(cur) > 2:
                contours.append(cur)
            cur = []
    return contours


def blur(a, sigma, axis):
    r = int(sigma * 3) + 1
    x = np.arange(-r, r + 1)
    k = np.exp(-(x**2) / (2 * sigma**2))
    k /= k.sum()
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), axis, a)


def trace(field):
    """Marssivat neliöt: tason 0,5 käyrät suljettuina lenkkeinä, täyttö vasemmalla."""
    h, w = field.shape
    inside = field >= 0.5
    segs = {}

    def cross(x0, y0, x1, y1):
        a, b = field[y0, x0], field[y1, x1]
        t = (0.5 - a) / (b - a)
        return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)

    for y in range(h - 1):
        for x in range(w - 1):
            tl, tr, br, bl = inside[y, x], inside[y, x + 1], inside[y + 1, x + 1], inside[y + 1, x]
            code = tl * 8 + tr * 4 + br * 2 + bl
            if code in (0, 15):
                continue
            top = lambda: cross(x, y, x + 1, y)
            right = lambda: cross(x + 1, y, x + 1, y + 1)
            bottom = lambda: cross(x, y + 1, x + 1, y + 1)
            left = lambda: cross(x, y, x, y + 1)
            # Jana kulkee niin, että täytetty puoli on kulkusuunnasta katsoen aina samalla puolella.
            table = {
                1: [(left, bottom)], 2: [(bottom, right)], 3: [(left, right)], 4: [(right, top)],
                5: [(left, top), (right, bottom)], 6: [(bottom, top)], 7: [(left, top)],
                8: [(top, left)], 9: [(top, bottom)], 10: [(top, right), (bottom, left)],
                11: [(top, right)], 12: [(right, left)], 13: [(right, bottom)], 14: [(bottom, left)],
            }
            for a, b in table[code]:
                p, q = a(), b()
                segs[(round(p[0], 4), round(p[1], 4))] = q
    loops = []
    while segs:
        start, nxt = segs.popitem()
        loop = [start]
        while True:
            key = (round(nxt[0], 4), round(nxt[1], 4))
            if key == start or key not in segs:
                break
            loop.append(key)
            nxt = segs.pop(key)
        if len(loop) > 3:
            loops.append(loop)
    return loops


def simplify(pts, tol):
    """Douglas–Peucker suljetulle lenkille."""

    def dp(p):
        if len(p) < 3:
            return p
        a, b = np.array(p[0]), np.array(p[-1])
        d = b - a
        n = np.hypot(*d) or 1
        dist = [abs(d[0] * (q[1] - a[1]) - d[1] * (q[0] - a[0])) / n for q in p[1:-1]]
        i = int(np.argmax(dist))
        if dist[i] <= tol:
            return [p[0], p[-1]]
        return dp(p[: i + 2])[:-1] + dp(p[i + 1 :])

    # Lenkki katkaistaan kahdesta kaukaisesta pisteestä.
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    return dp(pts[: far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]


def smooth_glyph(contours):
    xs = [p[0] for c in contours for p in c]
    ys = [p[1] for c in contours for p in c]
    x0, y0 = min(xs) - MARGIN, min(ys) - MARGIN
    w = int((max(xs) - min(xs) + 2 * MARGIN) / UNIT)
    h = int((max(ys) - min(ys) + 2 * MARGIN) / UNIT)
    mask = Image.new("1", (w, h), 0)
    for c in contours:
        layer = Image.new("1", (w, h), 0)
        ImageDraw.Draw(layer).polygon([((x - x0) / UNIT, (y - y0) / UNIT) for x, y in c], fill=1)
        mask = ImageChops.logical_xor(mask, layer)
    field = np.asarray(mask, dtype=float)
    field = blur(blur(field, SIGMA_Y / UNIT, 0), SIGMA_X / UNIT, 1)
    out = []
    for loop in trace(field):
        pts = [(x0 + (x + 0.5) * UNIT, y0 + (y + 0.5) * UNIT) for x, y in loop]
        pts = simplify(pts, TOLERANCE)
        if len(pts) >= 3:
            out.append(pts)
    return out


def area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def main():
    font = TTFont(SOURCE)
    glyf = font["glyf"]
    glyph_set = font.getGlyphSet()
    for name in font.getGlyphOrder():
        if glyf[name].numberOfContours == 0:
            continue
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(pen)
        contours = flatten(pen.value)
        if not contours:
            continue
        tt = TTGlyphPen(None)
        loops = smooth_glyph(contours)
        # TrueType: ulkoreuna myötäpäivään. Suunta tarkistetaan suurimmasta lenkistä.
        flip = area(max(loops, key=lambda l: abs(area(l)))) > 0 if loops else False
        for loop in loops:
            pts = [(round(x), round(y)) for x, y in (loop[::-1] if flip else loop)]
            tt.moveTo(pts[0])
            for p in pts[1:]:
                tt.lineTo(p)
            tt.closePath()
        glyf[name] = tt.glyph()
    # Vihjeet ja asettelutaulut koskivat vanhoja ääriviivoja.
    for tag in ("fpgm", "prep", "cvt ", "gasp"):
        if tag in font:
            del font[tag]
    for record in font["name"].names:
        text = record.toUnicode()
        if record.nameID in (1, 4, 16):
            record.string = NAME
        elif record.nameID == 6:
            record.string = NAME.replace(" ", "")
        elif record.nameID == 3:
            record.string = f"{NAME};{text}"
        elif record.nameID == 0:
            record.string = f"{text}. Smoothed for Lunkinjärvi."
    font.flavor = "woff2"
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    font.save(TARGET)
    print(TARGET, TARGET.stat().st_size, "tavua")


if __name__ == "__main__":
    main()
