import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REMOTE_FIGHT, RemoteFight } from './remoteFight';
import { ROD_BUTT, aimRod, createTubeMesh } from './tubeMesh';

describe('toisen väsytys näkyy (#368)', () => {
  it('pakeneva kala taivuttaa vapaa enemmän kuin lepäävä', () => {
    const still = new RemoteFight(() => 1);
    const running = new RemoteFight(() => 1);
    let rest = 0;
    let run = 0;
    for (let i = 0; i < 120; i++) {
      rest = still.update({ x: 10, y: 0 }, 1 / 60).bend;
      run = running.update({ x: 10 + (i * 3) / 60, y: 0 }, 1 / 60).bend;
    }
    expect(rest).toBeCloseTo(REMOTE_FIGHT.restBend);
    expect(run).toBeGreaterThan(0.95);
  });

  it('molskahdukset ovat harvinaisia ja tulevat vain piirron arvonnasta', () => {
    let n = 0;
    const fight = new RemoteFight(() => 0.001);
    for (let i = 0; i < 60; i++) if (fight.update({ x: 0, y: 0 }, 1 / 60).splash !== null) n++;
    expect(n).toBe(60);
    const never = new RemoteFight(() => 0.99);
    for (let i = 0; i < 600; i++) expect(never.update({ x: 0, y: 0 }, 1 / 60).splash).toBeNull();
    // Odotusarvo: lepäävä kala molskahtaa noin kerran splashEvery-sekunnissa.
    let seen = 0;
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const avg = new RemoteFight(rng);
    for (let i = 0; i < 60 * 400; i++) if (avg.update({ x: 0, y: 0 }, 1 / 60).splash) seen++;
    expect(seen / 400).toBeCloseTo(1 / REMOTE_FIGHT.splashEvery, 1);
  });

  it('vavan kahva pysyy kädessä, kun vapa nousee, kääntyy ja taipuu', () => {
    const g = createTubeMesh();
    const rod = g.getObjectByName('rod')!;
    const butt = () => {
      const first = rod.children[0] as THREE.Mesh;
      first.updateMatrixWorld(true);
      return first.localToWorld(new THREE.Vector3(-(2.1 / 6 + 0.04) / 2, 0, 0));
    };
    const rest = aimRod(g);
    // Lepoasento: nousukulma 0,25, kärki 2,1 m kahvasta.
    expect(rest.x).toBeCloseTo(ROD_BUTT.x + 2.1 * Math.cos(0.25), 2);
    expect(rest.y).toBeCloseTo(ROD_BUTT.y + 2.1 * Math.sin(0.25), 2);
    const restButt = butt();
    // Kala vasemmalla edessä (järven y kasvaa = maailman z pienenee).
    const fish = { x: 10, y: 8, depth: 1 };
    const lifted = aimRod(g, { lift: 0.6, bend: 0, flex: 0, pull: fish });
    expect(butt().distanceTo(restButt)).toBeLessThan(0.05);
    expect(lifted.y).toBeGreaterThan(ROD_BUTT.y + 1.1);
    const bent = aimRod(g, { lift: 0.6, bend: 1.2, flex: 0, pull: fish });
    expect(bent.z).toBeLessThan(rest.z);
    // Kuorma painaa kärkeä alas kalaa kohti.
    expect(bent.y).toBeLessThan(lifted.y - 0.3);
  });
});
