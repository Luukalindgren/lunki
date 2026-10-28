import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REMOTE_FIGHT, RemoteFight } from './remoteFight';
import { aimRod } from './tubeMesh';

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

  it('vavan kahva pysyy kädessä, kun vapa nousee ja kääntyy', () => {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1));
    rod.name = 'rod';
    g.add(rod);
    const butt = () => {
      rod.updateMatrixWorld(true);
      return rod.localToWorld(new THREE.Vector3(-1.05, 0, 0));
    };
    aimRod(g, 0, 0);
    // Lepoasento kuten ennen: nousukulma 0,25 ja keskikohta (1,1; 1,1; 0,38).
    expect(rod.rotation.z).toBeCloseTo(0.25);
    expect(rod.position.x).toBeCloseTo(1.1, 2);
    expect(rod.position.y).toBeCloseTo(1.1, 2);
    const rest = butt();
    aimRod(g, 1, 0.8);
    expect(butt().distanceTo(rest)).toBeLessThan(1e-6);
    rod.updateMatrixWorld(true);
    const tip = rod.localToWorld(new THREE.Vector3(1.05, 0, 0));
    expect(tip.y).toBeGreaterThan(2);
    // Kalaa kohti vasemmalle (järven y kasvaa = maailman z pienenee).
    expect(tip.z).toBeLessThan(rest.z);
  });
});
