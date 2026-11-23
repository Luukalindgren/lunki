import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAST, POLE } from '@lunki/shared';
import { REMOTE_FIGHT, RemoteFight, poleUprightAt } from './remoteFight';
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
    const handle = g.getObjectByName('rod-handle')!;
    const butt = () => {
      handle.updateMatrixWorld(true);
      return handle.localToWorld(new THREE.Vector3());
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

describe('muiden onkivapa väsytyksessä (#811)', () => {
  it('nousee pystyyn, kun kala on tullut virvelin kärjen kohdalle', () => {
    expect(poleUprightAt(POLE.reach + 2)).toBe(0);
    expect(poleUprightAt(POLE.reach)).toBe(0);
    expect(poleUprightAt(CAST.rodReach)).toBe(1);
    expect(poleUprightAt((POLE.reach + CAST.rodReach) / 2)).toBeCloseTo(0.5);
  });

  it('nousee pehmeästi eikä hyppää', () => {
    const fight = new RemoteFight(() => 1);
    const angler = { x: 0, y: 0 };
    expect(fight.update({ x: POLE.reach + 1, y: 0 }, 1 / 60, angler).upright).toBe(0);
    const first = fight.update({ x: CAST.rodReach, y: 0 }, 1 / 60, angler).upright;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.1);
    let up = first;
    for (let i = 0; i < 300; i++)
      up = fight.update({ x: CAST.rodReach, y: 0 }, 1 / 60, angler).upright;
    expect(up).toBeGreaterThan(0.99);
  });

  it('virvelillä (ilman kalastajan paikkaa) vapa ei nouse', () => {
    const fight = new RemoteFight(() => 1);
    expect(fight.update({ x: 1, y: 0 }, 1 / 60).upright).toBe(0);
  });

  it('onkivapa taipuu vähemmän kuin vavan suurin taipuma', () => {
    expect(REMOTE_FIGHT.poleBend).toBeLessThan(Math.PI / 2);
  });
});
