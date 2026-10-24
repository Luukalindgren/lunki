import {
  collideTubeWithShore,
  collideTubes,
  stepPlayerTube,
  type InputQueue,
  type TubeState,
  type WaterBody,
} from '@lunki/shared';

/** Palvelimen tila yhdelle pelaajalle. */
export interface Sim {
  tube: TubeState;
  inputs: InputQueue;
}

/**
 * Yksi palvelimen askel: jokainen rengas etenee yhdellä syötteellään
 * (tyhjällä jonolla odottaa), sitten ratkaistaan renkaiden väliset
 * törmäykset. Palauttaa muuttuneiden indeksit.
 */
export function stepSims(sims: Sim[], water: WaterBody): Set<number> {
  const moved = new Set<number>();
  sims.forEach((sim, i) => {
    const input = sim.inputs.next();
    if (!input) return;
    sim.tube = stepPlayerTube(sim.tube, input, water);
    moved.add(i);
  });
  const before = sims.map((s) => s.tube);
  const after = [...before];
  for (const i of collideTubes(after)) {
    sims[i]!.tube = collideTubeWithShore(before[i]!, after[i]!, water);
    moved.add(i);
  }
  return moved;
}
