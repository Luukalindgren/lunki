import type { Vec2 } from '../vec2';
import { ringWaterTest } from './surroundings';
import type { LakeMap, LakeSurroundings } from './types';

/**
 * Rantarakennukset: OSM:n pohjapiirros ja pyöristetty rantaviiva eivät osu
 * aivan yksiin, joten muutama rantasauna oli osittain järven päällä. Rengas
 * kellui sen seinän läpi, ja laituri alkoi rakennuksen sisältä. Nämä
 * rakennukset siirretään lyhintä matkaa maalle (BUILDING_SHORE_GAP rannasta).
 */
export const BUILDING_SHORE_GAP = 0.5;
/** Suurin siirto (m); kauempaa ei etsitä. */
const MAX_NUDGE = 15;
/** Rakennukset, joiden pohjapiirros on näin lähellä rantaa (m), ovat kävelyn esteitä. */
const SHORE_REACH = 10;

/** Pohjapiirroksen reunan näytteet 0,5 m välein: rakennus on vedessä, jos jokin niistä on. */
function samples(ring: readonly Vec2[], step = 0.5): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Onko pohjapiirros (tai sen ympärys `gap` metrin päähän) vedessä. */
function wet(ring: readonly Vec2[], isWater: (p: Vec2) => boolean, gap: number): boolean {
  const ring8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
    x: Math.cos((k * Math.PI) / 4) * gap,
    y: Math.sin((k * Math.PI) / 4) * gap,
  }));
  return samples(ring).some(
    (p) => isWater(p) || ring8.some((o) => isWater({ x: p.x + o.x, y: p.y + o.y })),
  );
}

/**
 * Ympäristö, jossa järven päälle ulottuvat rakennukset on siirretty maalle.
 * Siirto etsitään 16 suunnasta lyhimpänä, joten tulos on aina sama.
 */
export function nudgeBuildingsAshore(map: LakeMap, s: LakeSurroundings): LakeSurroundings {
  const isWater = ringWaterTest(map.shore, map.islands);
  const areas = s.areas.map((a) => {
    if (a.kind !== 'building') return a;
    const ring = a.rings[0]!;
    if (!wet(ring, isWater, 0)) return a;
    for (let d = 0.5; d <= MAX_NUDGE; d += 0.5) {
      for (let k = 0; k < 16; k++) {
        const dx = Math.cos((k * Math.PI) / 8) * d;
        const dy = Math.sin((k * Math.PI) / 8) * d;
        const moved = ring.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        if (!wet(moved, isWater, BUILDING_SHORE_GAP))
          return { ...a, rings: [moved, ...a.rings.slice(1)] };
      }
    }
    return a;
  });
  return { ...s, areas };
}

/** Rantaa lähellä olevien rakennusten pohjapiirrokset: maalla kävelevän esteet (#457). */
export function shoreBuildings(map: LakeMap, s: LakeSurroundings): Vec2[][] {
  const isWater = ringWaterTest(map.shore, map.islands);
  return s.areas
    .filter((a) => a.kind === 'building')
    .map((a) => a.rings[0]!)
    .filter((ring) => wet(ring, isWater, SHORE_REACH));
}
