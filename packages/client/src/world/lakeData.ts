import {
  LUNKINJARVI,
  LUNKINJARVI_BOTTOM,
  LakeBottom,
  type LakeMap,
  type WaterBody,
} from '@lunki/shared';

/** Pohja lasketaan kerran karttaa kohden (valikon taustajärvi, kisa ja kartta jakavat sen). */
const bottoms = new WeakMap<LakeMap, LakeBottom>();

export function bottomFor(map: LakeMap, water: WaterBody): LakeBottom {
  let b = bottoms.get(map);
  if (!b) {
    const features = map === LUNKINJARVI ? LUNKINJARVI_BOTTOM : { maxDepth: 6, features: [] };
    b = new LakeBottom(water, map.bounds, features, map.reeds);
    bottoms.set(map, b);
  }
  return b;
}
