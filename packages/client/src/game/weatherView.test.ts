import { describe, expect, it } from 'vitest';
import { planWeather } from '@lunki/shared';
import { WeatherView, windName } from './weatherView';

describe('sään näkymä', () => {
  it('tuuli nimetään suunnasta, josta se tulee', () => {
    // Puhaltaa pohjoiseen = tulee etelästä.
    expect(windName(Math.PI / 2)).toBe('etelätuuli');
    expect(windName(0)).toBe('länsituuli');
    expect(windName(Math.PI)).toBe('itätuuli');
    expect(windName(-Math.PI / 4)).toBe('luoteistuuli');
  });

  it('varoittaa muutoksesta kerran ja kertoo muutoksen', () => {
    const plan = planWeather(3, 'chaos', 600);
    const view = new WeatherView(plan);
    const messages: string[] = [];
    let rumbles = 0;
    const events = { message: (m: string) => messages.push(m), rumble: () => rumbles++ };
    for (let t = 0; t < 600; t += 0.5)
      view.update(0.5, t, { x: 0, y: 0 }, { metersPerPixel: 1, width: 400 }, events);
    const changes = plan.segments.filter((s) => s.start > 0.5 && s.start < 600).length;
    expect(messages.filter((m) => m.startsWith('Sää muuttuu')).length).toBe(changes);
    // Ei samaa varoitusta kahdesti peräkkäin saman muutoksen aikana.
    const warnings = messages.filter((m) => !m.startsWith('Sää muuttuu'));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length).toBeLessThanOrEqual(changes * 3);
    expect(rumbles).toBeGreaterThan(0);
  });
});
