#!/usr/bin/env python3
"""Tekee VT323-fontista terävän version Terävälle ilmeelle.

VT323 on piirretty juovina: jokainen merkki on 80 yksikön korkuisia vaakarivejä,
ja vinot viivat ovat portaita. Tämä lukee jokaisen merkin juovat, piirtää niiden
yhteisen ääriviivan ja suoristaa portaat vinoviivoiksi katkaisemalla askeleet
puolivälistä. Mitään ei pyöristetä: suorat reunat pysyvät paikallaan, viivojen
päät ja risteykset jäävät teräviksi kulmiksi ja kaaret ovat monikulmioita.
Merkkien leveydet ja rivikorkeus ovat samat kuin VT323:ssa, joten asettelu ei
muutu, kun fontti vaihtuu ilmeen mukana.

Käyttö (riippuvuudet: fonttools, brotli):
    python3 scripts/fontti/sileafontti.py

Lähde: @fontsource/vt323 (SIL Open Font License 1.1). Tulos on saman lisenssin
alainen johdannainen eri nimellä (Lunki Sileä).
"""
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/client/node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2"
TARGET = ROOT / "packages/client/src/assets/lunki-silea.woff2"
NAME = "Lunki Silea"

# VT323:n juovan korkeus fonttiyksikköinä.
ROW = 80
# Portaan askel on enintään näin pitkä; pidempi reuna on suora sivu.
STEP = 170
# Jyrkän viivan askeleen leveys on enintään tämä.
STEEP = 50
# Tätä kapeampi yhden juovan korkuinen rako täytetään.
SLIT = 50
# Raon vieressä on oltava vähintään näin leveä kaari.
BOWL = 110
# Suoran sivun päästä leikataan portaan vierestä enintään näin paljon.
CUT = 40


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


def spans(contours, y):
    """Merkin täytetyt välit korkeudella y (parillinen-pariton-sääntö)."""
    xs = []
    for c in contours:
        for (x0, y0), (x1, y1) in zip(c, c[1:] + c[:1]):
            if (y0 <= y) != (y1 <= y):
                xs.append(round(x0 + (x1 - x0) * (y - y0) / (y1 - y0)))
    xs.sort()
    return [(a, b) for a, b in zip(xs[::2], xs[1::2]) if b > a]


def close_slits(rows):
    """Täyttää yhden juovan korkuiset kapeat raot.

    VT323:ssa kaari on paikoin irti varresta kapean raon verran (b, n, u), ja
    juovien pullistuma peittää sen pienessä koossa. Terävillä reunoilla rako
    näkyisi viiltona. Usean juovan korkuinen rako (m:n sakarat) on tarkoitettu.
    """

    def slits(r):
        sp = rows.get(r, [])
        return [(a[1], b[0]) for a, b in zip(sp, sp[1:]) if b[0] - a[1] <= SLIT]

    out = {}
    for r, sp in rows.items():
        near = slits(r - 1) + slits(r + 1)
        merged = [sp[0]]
        for a, b in sp[1:]:
            gap = (merged[-1][1], a)
            lone = gap[1] - gap[0] <= SLIT and not any(g[0] < gap[1] and gap[0] < g[1] for g in near)
            # Vinoviivan pala (N, W) on kapea; kaari on leveä.
            wide = max(merged[-1][1] - merged[-1][0], b - a) >= BOWL
            lone = lone and wide
            if lone:
                merged[-1] = (merged[-1][0], b)
            else:
                merged.append((a, b))
        out[r] = merged
    return out


def outline(rows):
    """Juovien yhdisteen suorakulmaiset ääriviivat lenkkeinä, täyttö vasemmalla."""
    xs = sorted({x for sp in rows.values() for ab in sp for x in ab})
    col = {x: i for i, x in enumerate(xs)}
    ys = sorted(rows)
    filled = set()
    for r in ys:
        for a, b in rows[r]:
            for i in range(col[a], col[b]):
                filled.add((i, r))
    # Suunnatut reunat ruudukon kulmasta kulmaan.
    edges = {}
    for i, r in filled:
        for a, b, out in (
            ((i, r), (i + 1, r), (i, r - 1)),
            ((i + 1, r), (i + 1, r + 1), (i + 1, r)),
            ((i + 1, r + 1), (i, r + 1), (i, r + 1)),
            ((i, r + 1), (i, r), (i - 1, r)),
        ):
            if out not in filled:
                edges.setdefault(a, []).append(b)
    loops = []
    while edges:
        start = next(iter(edges))
        loop, cur, prev = [], start, None
        while True:
            outs = edges[cur]
            nxt = outs[0]
            if len(outs) > 1 and prev is not None:
                # Kulmittain koskevat juovat ovat samaa viivaa: käänny oikeaan, jolloin ne yhdistyvät.
                d = (cur[0] - prev[0], cur[1] - prev[1])
                right = (cur[0] + d[1], cur[1] - d[0])
                nxt = right if right in outs else nxt
            outs.remove(nxt)
            if not outs:
                del edges[cur]
            loop.append(cur)
            prev, cur = cur, nxt
            if cur == start:
                break
        pts = [(xs[i], r * ROW) for i, r in loop]
        # Samansuuntaiset peräkkäiset reunat yhdeksi.
        keep = []
        for k, p in enumerate(pts):
            a, b = pts[k - 1], pts[(k + 1) % len(pts)]
            if (p[0] - a[0]) * (b[1] - p[1]) != (p[1] - a[1]) * (b[0] - p[0]):
                keep.append(p)
        loops.append(keep)
    return loops


def bevel(pts):
    """Portaat vinoviivoiksi: portaan askeleet katkaistaan puolivälistä.

    Askel on lyhyt reuna, jonka päissä käännytään eri suuntiin. Sen päät
    korvataan leikkauksella reunojen puolivälistä, jolloin peräkkäiset askeleet
    asettuvat yhdelle suoralle. Muut kulmat (viivan päät, risteykset) jäävät
    teräviksi.
    """
    n = len(pts)

    def turn(k):
        a, p, b = pts[k - 1], pts[k], pts[(k + 1) % n]
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) > 0

    def length(k):
        a, b = pts[k], pts[(k + 1) % n]
        return abs(b[0] - a[0]) + abs(b[1] - a[1])

    # step[k]: reuna pisteestä k seuraavaan on portaan askel.
    def short(k):
        # Vaakasuora askel saa olla kahden juovan levyinen. Pystysuora on juovan
        # korkuinen, tai kahden, jos viereinen vaaka on kapea (jyrkkä viiva).
        if pts[k][1] == pts[(k + 1) % n][1] or length(k) <= ROW:
            return length(k) <= STEP
        return length(k) <= STEP and min(length(k - 1), length((k + 1) % n)) <= STEEP

    jog = [turn(k) != turn((k + 1) % n) and short(k) for k in range(n)]
    # Yksittäinen pykälä (viivan ylitys, väkänen) ei ole porras: askelia on oltava kaksi peräkkäin.
    step = [jog[k] and (jog[k - 1] or jog[(k + 1) % n]) for k in range(n)]
    out = []
    for k in range(n):
        before, after = (k - 1) % n, k
        if not (step[before] or step[after]):
            out.append(pts[k])
            continue
        a, p, b = pts[k - 1], pts[k], pts[(k + 1) % n]
        for other, edge in ((a, before), (b, after)):
            size = length(edge)
            cut = size / 2 if step[edge] else min(size / 2, CUT)
            q = (p[0] + (other[0] - p[0]) * cut / size, p[1] + (other[1] - p[1]) * cut / size)
            if not out or out[-1] != q:
                out.append(q)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def smooth_glyph(contours):
    ys = [p[1] for c in contours for p in c]
    rows = {}
    for r in range(int(min(ys) // ROW), int(max(ys) // ROW) + 1):
        sp = spans(contours, r * ROW + 2)
        if sp:
            rows[r] = sp
    return [loop for loop in (bevel(l) for l in outline(close_slits(rows))) if len(loop) >= 3]


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
