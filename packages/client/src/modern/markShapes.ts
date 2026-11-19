import * as THREE from 'three';
import { mergeParts, paint } from './shapes';

/** Väreen kehät osuutena säteestä: ohut ulkokehä ja sen sisällä heikompi. */
const RIPPLE = [
  [0.89, 1],
  [0.58, 0.64],
] as const;

/**
 * Roiskerengas väreenä: kaksi ohutta sileää kehää pelin renkaan säteellä
 * (xy-tasossa kuten pelin rengas).
 */
export function rippleShape(bounds: THREE.Box3): THREE.BufferGeometry {
  const radius = bounds.max.x;
  return mergeParts(
    RIPPLE.map(([inner, outer]) => new THREE.RingGeometry(radius * inner, radius * outer, 64)),
  );
}

/** Vieheen merkki: hiottu timantti, leveys 1 ja keskikohta origossa. */
export function gemShape(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.5);
}

/** Kohon värit (samat kuin pikselikohossa) ja mitat korkeuden osuuksina. */
const FLOAT = {
  red: 0xd23a2a,
  white: 0xeef2f3,
  antenna: 0xf6d04d,
  /** Rungon yläreuna; sen yläpuolella on antenni (pikselikohossa 3/11 ylhäältä). */
  body: 8 / 11,
  /** Punaisen ja valkoisen raja. */
  split: 0.4,
  antennaRadius: 0.03,
} as const;

/**
 * Ongen koho (#570): sorvattu pisaranmuotoinen runko, yläpuoli punainen ja
 * alapuoli valkoinen, ja ohut keltainen antenni. Korkeus 1 ja alapää
 * origossa; leveys on pikselikohon tavoin vajaa puolet korkeudesta.
 */
export function floatShape(): THREE.BufferGeometry {
  const profile = [
    [0, 0],
    [0.05, 0.02],
    [0.12, 0.1],
    [0.19, 0.24],
    [0.225, 0.4],
    [0.2, 0.55],
    [0.13, 0.66],
    [0.05, FLOAT.body],
    [0, FLOAT.body + 0.005],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(profile, 24);
  const antenna = new THREE.CylinderGeometry(
    FLOAT.antennaRadius,
    FLOAT.antennaRadius,
    1 - FLOAT.body + 0.02,
    8,
  ).translate(0, (1 + FLOAT.body - 0.02) / 2, 0);
  const tip = new THREE.SphereGeometry(FLOAT.antennaRadius * 1.6, 8, 6).translate(0, 1, 0);
  // Lathe ja lieriö ovat eri muotoisia (indeksoitu ja ei), joten ne yhdistetään indeksittä.
  return mergeParts(
    [body, antenna, tip].map((g) => {
      const plain = g.index ? g.toNonIndexed() : g;
      if (plain !== g) g.dispose();
      return paint(plain, (_x, y) =>
        y > FLOAT.body ? FLOAT.antenna : y > FLOAT.split ? FLOAT.red : FLOAT.white,
      );
    }),
  );
}

/** Kohon leveys korkeuden osuutena: ylhäältä koho on tämän levyinen kiekko. */
export const FLOAT_WIDTH = 0.45;
