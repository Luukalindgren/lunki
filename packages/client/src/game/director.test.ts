import { describe, expect, it } from 'vitest';
import { DIRECTOR, Director, type DirectorAngler } from './director';

const anglers = (...ids: string[]): DirectorAngler[] =>
  ids.map((id) => ({ id, hooked: false, lureOut: true }));
const ORDER = ['a', 'b', 'c', 'd'];
const LONG = 900;

/** Ajaa ohjaajaa sekunnin välein hetkeen `to` asti. */
function run(d: Director, from: number, to: number, list = anglers(...ORDER), left = LONG) {
  let shot = d.shot;
  for (let t = from; t <= to; t++) shot = d.step(t, list, ORDER, left - t);
  return shot;
}

describe('ohjaaja (#564)', () => {
  it('kisa alkaa yleiskuvalla, sitten kuva kiertää tulostaulun kärjestä', () => {
    const d = new Director();
    expect(d.step(0, anglers(...ORDER), ORDER, LONG).view).toBe('overview');
    const shot = run(d, 1, DIRECTOR.overview + 1);
    expect(shot.id).toBe('a');
    expect(shot.reason).toBe('rotate');
  });

  it('tyhjinä hetkinä kuva vaihtuu pisimmän kuvan jälkeen seuraavaan', () => {
    const d = new Director();
    run(d, 0, DIRECTOR.overview + 1);
    const first = d.shot;
    const later = run(d, DIRECTOR.overview + 2, DIRECTOR.overview + DIRECTOR.maxShot + 2);
    expect(later.id).not.toBe(first.id);
  });

  it('kala kiinni vie kuvan heti, kun lyhin kuva on täynnä', () => {
    const d = new Director();
    run(d, 0, 20);
    const shown = d.shot.id;
    const other = ORDER.find((id) => id !== shown)!;
    d.event('fishOn', [other], 21);
    const shot = run(d, 21, 22);
    expect(shot.id).toBe(other);
    expect(shot.reason).toBe('fishOn');
  });

  it('pientä tapahtumaa ei vaihdeta kesken lyhimmän kuvan, isoa vaihdetaan', () => {
    const d = new Director();
    run(d, 0, DIRECTOR.overview + 1);
    const shown = d.shot.id;
    const [x, y] = ORDER.filter((id) => id !== shown);
    d.event('tangle', [x!], DIRECTOR.overview + 2);
    expect(run(d, DIRECTOR.overview + 2, DIRECTOR.overview + 3).id).toBe(shown);
    d.event('capsize', [y!], DIRECTOR.overview + 4);
    expect(run(d, DIRECTOR.overview + 4, DIRECTOR.overview + 4).id).toBe(y);
  });

  it('isotkaan tapahtumat eivät leikkaa kuvaa muutamaa sekuntia nopeammin', () => {
    const d = new Director();
    run(d, 0, 20);
    d.event('capsize', ['c'], 21);
    expect(run(d, 21, 21).id).toBe('c');
    d.event('capsize', ['d'], 22);
    d.event('record', ['d'], 22);
    expect(run(d, 22, 21 + DIRECTOR.minBig - 1).id).toBe('c');
    expect(run(d, 21 + DIRECTOR.minBig, 21 + DIRECTOR.minBig).id).toBe('d');
  });

  it('väsytys näkyy ensin ylhäältä, sitten kalastajan silmin, ja pysyy kuvassa', () => {
    const d = new Director();
    run(d, 0, 20);
    const list = anglers(...ORDER);
    list[2]!.hooked = true;
    d.event('fishOn', ['c'], 21);
    const start = run(d, 21, 22, list);
    expect(start).toMatchObject({ id: 'c', view: 'top' });
    const later = run(d, 23, 21 + DIRECTOR.fightTopFirst + 1, list);
    expect(later).toMatchObject({ id: 'c', view: 'pov', reason: 'fight' });
    // Pitkäkin väsytys pysyy kuvassa yli pisimmän kuvan.
    expect(run(d, 30, 21 + DIRECTOR.maxShot * 2, list).id).toBe('c');
  });

  it('väsytyksen päätyttyä alaotsikko kertoo saaliin eikä enää väsytystä', () => {
    const d = new Director();
    run(d, 0, 20);
    const list = anglers(...ORDER);
    list[1]!.hooked = true;
    d.event('fishOn', ['b'], 21);
    expect(run(d, 21, 22, list).reason).toBe('fight');
    list[1]!.hooked = false;
    d.event('catch', ['b'], 30);
    expect(run(d, 30, 31, list)).toMatchObject({ id: 'b', reason: 'catch', view: 'top' });
  });

  it('sotku ja kaatuminen näytetään ylhäältä, vaikka kala olisi kiinni', () => {
    const d = new Director();
    run(d, 0, 20);
    const list = anglers(...ORDER);
    list[3]!.hooked = true;
    run(d, 21, 40, list);
    d.event('capsize', ['d'], 41);
    expect(run(d, 41, 44, list)).toMatchObject({ id: 'd', view: 'top', reason: 'capsize' });
  });

  it('samaa kalastajaa ei näytetä uudelleen heti pienestä tapahtumasta', () => {
    const d = new Director();
    run(d, 0, 20);
    d.event('fishOn', ['b'], 21);
    run(d, 21, 22);
    d.event('fishOn', ['c'], 31);
    expect(run(d, 31, 32).id).toBe('c');
    d.event('tangle', ['b'], 39);
    // b oli kuvassa alle jäähdyttelyn sitten, eikä sotku ole iso tapahtuma.
    expect(run(d, 39, 40).id).toBe('c');
  });

  it('käsiohjaus pitää kuvan, ja ohjaaja jatkaa sen jälkeen', () => {
    const d = new Director();
    run(d, 0, 20);
    d.manual('d', 'pov', 21);
    d.event('capsize', ['a'], 22);
    expect(run(d, 22, 30)).toMatchObject({ id: 'd', view: 'pov', reason: 'manual' });
    expect(run(d, 31, 21 + DIRECTOR.manualHold + 1).id).not.toBe('d');
  });

  it('kuvattava lähti: heti uusi kuva', () => {
    const d = new Director();
    run(d, 0, 20);
    const shown = d.shot.id!;
    const rest = ORDER.filter((id) => id !== shown);
    const shot = d.step(21, anglers(...rest), ORDER, LONG - 21);
    expect(shot.id).not.toBe(shown);
    expect(shot.since).toBe(21);
  });

  it('viimeisen minuutin alussa yleiskuva', () => {
    const d = new Director();
    run(d, 0, 30, anglers(...ORDER), 120);
    const shot = run(d, 31, 61, anglers(...ORDER), 120);
    expect(shot.view).toBe('overview');
  });

  it('järvellä ei ketään: yleiskuva', () => {
    const d = new Director();
    expect(d.step(50, [], [], LONG).view).toBe('overview');
  });
});
