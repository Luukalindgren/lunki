"""Piirtää pelin sovelluskuvakkeet (#240) 32x32-pikselikuvista.

Kuvat suurennetaan teräväreunaisesti (nearest neighbour), joten pikselit
säilyvät. Kaikki koot tehdään samasta kuvasta:

    python3 scripts/ikoni/piirra.py              # oletusikoni -> public/icons
    python3 scripts/ikoni/piirra.py --vaihtoehdot KANSIO   # kaikki vaihtoehdot esikatseluun

Oletusikonin voi vaihtaa muuttamalla OLETUS-muuttujaa.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

KOKO = 32
JUURI = Path(__file__).resolve().parents[2]
KUVAKKEET = JUURI / "packages" / "client" / "public" / "icons"
JULKINEN = JUURI / "packages" / "client" / "public"

# Pelin paletti: järven sininen tausta ja Pro Pilkki -henkiset kirkkaat värit.
VARIT = {
    ".": (0x12, 0x3A, 0x5C),  # järvi
    "a": (0x1B, 0x5A, 0x84),  # aalto
    "b": (0x2B, 0x7A, 0xA6),  # aallon harja
    "c": (0x3B, 0x2A, 0x1E),  # vavan kahva / tumma
    "d": (0xEE, 0xF2, 0xF3),  # valkoinen
    "e": (0xC3, 0xCB, 0xD2),  # siima / harmaa
    "f": (0xD2, 0x3A, 0x2A),  # punainen
    "g": (0xF0, 0x8A, 0x2C),  # oranssi
    "h": (0xF6, 0xD0, 0x4D),  # keltainen
    "i": (0x8C, 0x1C, 0x1C),  # pipo
    "j": (0x24, 0x50, 0x2C),  # takki / hauen selkä
    "k": (0xE0, 0xCF, 0x9C),  # iho / vatsa
    "m": (0x4F, 0x86, 0x3A),  # hauen kylki
    "n": (0xC9, 0xD8, 0x7A),  # hauen täplät
    "o": (0x0B, 0x0F, 0x14),  # silmä
    "s": (0x9A, 0xA3, 0xAB),  # metalli
}

# A: kelluntarengas ylhäältä, vapa ja siima ojossa (alkuperäinen ikoni).
RENGAS = """
................................
................................
................................
....ab..........................
...aaaaa....................c...
...........................cd...
..........................c.e...
............ffffffff.....c..d...
..........ffggggggggffb.c...e...
.........ffggggggggggffca...d...
........fgggggggggggggcf....e...
.......ffgggghhhhhhggcgff...d...
.......fggghh......hcgggf...h...
......fggggh..iiii..hggggf.ff...
......fgggh..jiiiij..hgggf......
......fgggh.jjkkkkjj.hgggf......
......fgggh.jjkkkkjj.hgggf......
......ffgggjjjkkkkjjjgggff......
......ffggg.jjjkkjjj.gggff......
......ffggg.jjjjjjjj.gggff......
......ffgggg.jjjjjj.ggggffb.....
.......ffgggg.jjjj.ggggffaaaa...
.......fffggggggggggggfff.......
........fffggggggggggfff........
......ab.fffggggggggfff.........
.....aaaaaffffffffffff..........
............ffffffff............
....................ab..........
...................aaaaa........
................................
................................
................................
"""


def ruudukko(teksti: str) -> list[list[str]]:
    rivit = [r for r in teksti.strip("\n").split("\n")]
    assert len(rivit) == KOKO and all(len(r) == KOKO for r in rivit), "kuvan pitää olla 32x32"
    return [list(r) for r in rivit]


def tyhja() -> list[list[str]]:
    return [["."] * KOKO for _ in range(KOKO)]


def aallot(g: list[list[str]], kohdat: list[tuple[int, int]]) -> None:
    """Pienet retroaallot kuten alkuperäisessä ikonissa."""
    for x, y in kohdat:
        g[y][x + 1] = "a"
        g[y][x + 2] = "b"
        for dx in range(5):
            g[y + 1][x + dx] = "a"


def hauki() -> list[list[str]]:
    """B: hauki hyppää vedestä punavalkoisen lusikan perään."""
    g = tyhja()
    # Vedenpinta ja roiskeet hauen pyrstön ympärillä.
    for x in range(KOKO):
        g[27][x] = "a"
        for y in range(28, KOKO):
            g[y][x] = "a" if (x + y) % 7 else "b"
    for x, y in [(4, 26), (5, 25), (10, 25), (11, 26), (3, 24), (12, 24), (8, 26), (6, 23)]:
        g[y][x] = "d" if (x + y) % 2 else "b"
    # Hauen keskilinja kaarena pyrstöstä (vasen ala) kitaan (oikea ylä).
    def kohta(t: float) -> tuple[float, float]:
        return 7.0 + 15.0 * t, 24.0 - 12.0 * t - 3.0 * math.sin(math.pi * t)

    def suunta(t: float) -> tuple[float, float, float, float]:
        dx, dy = 15.0, -12.0 - 3.0 * math.pi * math.cos(math.pi * t)
        n = math.hypot(dx, dy)
        return dx / n, dy / n, -dy / n, dx / n  # tangentti, normaali vatsan puolelle

    def paksuus(t: float) -> float:
        if t < 0.15:
            return 0.8 + 8 * t
        if t < 0.8:
            return 2.2
        return 2.2 - (t - 0.8) * 3.5

    def piste(t: float, siirto: float, pitkin: float = 0.0) -> tuple[int, int]:
        cx, cy = kohta(t)
        tx, ty, nx, ny = suunta(t)
        return round(cx + nx * siirto + tx * pitkin), round(cy + ny * siirto + ty * pitkin)

    for i in range(400):
        t = i / 399
        r = paksuus(t)
        for s in range(-30, 31):
            o = s / 30 * r
            x, y = piste(t, o)
            if o > r * 0.35:
                vari = "k"  # vatsa
            elif o < -r * 0.45:
                vari = "j"  # selkä
            else:
                vari = "m"  # kylki
            g[y][x] = vari
    # Täplät kyljessä.
    for t in (0.28, 0.4, 0.52, 0.64):
        x, y = piste(t, -0.3)
        g[y][x] = "n"
    # Haarautuva pyrstö ja punertavat evät.
    for pitkin, siirto in [(-1, 0), (-2, -1), (-3, -2), (-2, 1), (-3, 2), (-3, -1), (-3, 1)]:
        x, y = piste(0.0, siirto, pitkin)
        g[y][x] = "f"
    for t, siirto in [(0.22, -2.5), (0.26, -2.8), (0.3, -2.5)]:  # selkäevä takana
        x, y = piste(t, siirto)
        g[y][x] = "f"
    for t, siirto in [(0.24, 2.6), (0.5, 2.8), (0.72, 2.6), (0.75, 3.2)]:  # peräevä, vatsa- ja rintaevät
        x, y = piste(t, siirto)
        g[y][x] = "f"
    # Avoin kita: yläleuka jatkuu, alaleuka aukeaa alas.
    hx, hy = piste(1.0, 0)
    for x, y in [(hx + 1, hy - 1), (hx + 2, hy - 2), (hx + 3, hy - 2)]:
        g[y][x] = "j"
    for x, y in [(hx + 1, hy + 1), (hx + 2, hy + 1), (hx + 3, hy + 2)]:
        g[y][x] = "k"
    for x, y in [(hx + 1, hy), (hx + 2, hy), (hx + 2, hy - 1), (hx + 3, hy - 1), (hx + 3, hy + 1)]:
        g[y][x] = "f"  # suun sisus
    ex, ey = piste(0.9, -1.2)
    g[ey][ex] = "o"
    g[ey - 1][ex] = "h"
    # Siima ylhäältä ja lusikka kidan edessä.
    lx, ly = hx + 3, hy - 7
    for y in range(0, ly):
        g[y][lx + 1] = "e"
    lusikka = [
        (lx + 1, ly, "s"),
        (lx, ly + 1, "f"), (lx + 1, ly + 1, "f"), (lx + 2, ly + 1, "f"),
        (lx, ly + 2, "d"), (lx + 1, ly + 2, "d"), (lx + 2, ly + 2, "f"),
        (lx, ly + 3, "f"), (lx + 1, ly + 3, "f"), (lx + 2, ly + 3, "d"),
        (lx + 1, ly + 4, "f"),
        (lx + 1, ly + 5, "s"),
    ]
    for x, y, v in lusikka:
        g[y][x] = v
    aallot(g, [(17, 4), (4, 8)])
    return g


def lusikka() -> list[list[str]]:
    """C: klassinen punavalkoinen lusikkauistin kolmihaarakoukulla."""
    g = tyhja()
    # Siima ja leikkari.
    for y in range(0, 5):
        g[y][16] = "e"
    g[5][16] = "s"
    g[6][15] = "s"
    g[6][17] = "s"
    g[7][16] = "s"
    # Lusikka: kallistettu ellipsi.
    kx, ky, ra, rb, kulma = 16.0, 15.5, 9.2, 5.6, math.radians(-62)
    for y in range(KOKO):
        for x in range(KOKO):
            px, py = x + 0.5 - kx, y + 0.5 - ky
            u = px * math.cos(kulma) + py * math.sin(kulma)
            v = -px * math.sin(kulma) + py * math.cos(kulma)
            d = (u / ra) ** 2 + (v / rb) ** 2
            if d <= 1:
                if d > 0.72:
                    g[y][x] = "i" if v > 0 else "f"  # reuna, alapuoli varjossa
                elif -2.2 < u < 1.0:
                    g[y][x] = "d"  # valkoinen raita
                else:
                    g[y][x] = "f"
                if -5.5 < u < -3.5 and -2.8 < v < -1.2:
                    g[y][x] = "d"  # kiilto
    # Kolmihaarakoukku lusikan alapäässä.
    for y in range(24, 28):
        g[y][16] = "s"
    for x, y in [(13, 28), (14, 29), (15, 29), (16, 29), (17, 29), (18, 29), (19, 28), (16, 28)]:
        g[y][x] = "s"
    for x, y in [(12, 27), (20, 27), (16, 30)]:
        g[y][x] = "e"
    g[23][16] = "h"  # punainen/keltainen tupsu koukun yllä
    g[24][15] = "h"
    g[24][17] = "h"
    aallot(g, [(3, 4), (23, 8), (2, 20), (24, 25)])
    return g


VAIHTOEHDOT = {
    "rengas": lambda: ruudukko(RENGAS),
    "hauki": hauki,
    "lusikka": lusikka,
}
OLETUS = "rengas"


def kuva(g: list[list[str]], kerroin: int) -> Image.Image:
    im = Image.new("RGB", (KOKO, KOKO))
    im.putdata([VARIT[c] for rivi in g for c in rivi])
    return im.resize((KOKO * kerroin, KOKO * kerroin), Image.NEAREST)


def kehyksella(g: list[list[str]], kerroin: int, koko: int) -> Image.Image:
    """Kuva keskelle isompaa järvensinistä taustaa (Androidin pyöreä rajaus,
    iPhonen 180 px)."""
    taso = Image.new("RGB", (koko, koko), VARIT["."])
    sisa = kuva(g, kerroin)
    reuna = (koko - sisa.width) // 2
    taso.paste(sisa, (reuna, reuna))
    return taso


def tallenna(g: list[list[str]], kansio: Path) -> None:
    kansio.mkdir(parents=True, exist_ok=True)
    kuva(g, 6).save(kansio / "icon-192.png", optimize=True)
    kuva(g, 16).save(kansio / "icon-512.png", optimize=True)
    # Maskable: Android rajaa ikonin ympyräksi, jonka säde on 40 % koosta.
    # 12x = 384 px keskellä 512 px:n tausta pitää vavankärjenkin rajauksen sisällä.
    kehyksella(g, 12, 512).save(kansio / "icon-maskable-512.png", optimize=True)
    kehyksella(g, 5, 180).save(kansio / "apple-touch-icon.png", optimize=True)
    kuva(g, 1).save(kansio / "favicon-32.png", optimize=True)
    kuva(g, 2).save(
        kansio / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )


def esikatselu(kansio: Path) -> None:
    """Vaihtoehdot rinnakkain: iso, maskable-ympyrä ja 32 px."""
    kansio.mkdir(parents=True, exist_ok=True)
    rivit = []
    for nimi, tee in VAIHTOEHDOT.items():
        g = tee()
        kuva(g, 16).save(kansio / f"{nimi}-512.png", optimize=True)
        tallenna(g, kansio / nimi)
        maski = kehyksella(g, 12, 512).resize((256, 256), Image.NEAREST)
        ympyra = Image.new("L", (256, 256), 0)
        from PIL import ImageDraw

        ImageDraw.Draw(ympyra).ellipse((26, 26, 230, 230), fill=255)
        tausta = Image.new("RGB", (256, 256), (0xF2, 0xF2, 0xF2))
        tausta.paste(maski, (0, 0), ympyra)
        rivi = Image.new("RGB", (256 * 2 + 64 + 48, 256), (0xF2, 0xF2, 0xF2))
        rivi.paste(kuva(g, 8), (0, 0))
        rivi.paste(tausta, (272, 0))
        rivi.paste(kuva(g, 1), (272 + 256 + 24, 112))
        rivit.append(rivi)
    arkki = Image.new("RGB", (rivit[0].width, len(rivit) * 272 - 16), (0xF2, 0xF2, 0xF2))
    for i, r in enumerate(rivit):
        arkki.paste(r, (0, i * 272))
    arkki.save(kansio / "vaihtoehdot.png", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--vaihtoehdot":
        esikatselu(Path(sys.argv[2]))
    else:
        tallenna(VAIHTOEHDOT[OLETUS](), KUVAKKEET)
        (KUVAKKEET / "favicon.ico").replace(JULKINEN / "favicon.ico")
