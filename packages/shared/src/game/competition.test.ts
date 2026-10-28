import { describe, expect, it } from 'vitest';
import {
  createCompetition,
  UNTIMED,
  formatTime,
  planSeconds,
  recordCatch,
  stepCompetition,
  summarize,
  timeLeft,
} from './competition';

const perch = (weight: number) => ({ species: 'perch' as const, name: 'Ahven', weight });

describe('kilpailu', () => {
  it('aika loppuu kerran', () => {
    const c = createCompetition({ durationMinutes: 10, difficulty: 'easy', winRule: 'total' });
    let ended = 0;
    for (let i = 0; i < 601 * 60; i++) if (stepCompetition(c, 1 / 60)) ended++;
    expect(ended).toBe(1);
    expect(c.finished).toBe(true);
    expect(timeLeft(c)).toBe(0);
  });

  it('aikarajaton sessio ei pääty itsestään (#360)', () => {
    const c = createCompetition({ durationMinutes: UNTIMED, difficulty: 'easy', winRule: 'total' });
    for (let i = 0; i < 5 * 3600; i++) expect(stepCompetition(c, 1)).toBe(false);
    expect(c.finished).toBe(false);
    expect(timeLeft(c)).toBe(Infinity);
    expect(recordCatch(c, perch(0.2))?.time).toBe(5 * 3600);
    expect(planSeconds(c.settings)).toBeGreaterThanOrEqual(12 * 3600);
    expect(planSeconds({ durationMinutes: 15 })).toBe(900);
  });

  it('saaliit kirjataan vain kilpailun aikana', () => {
    const c = createCompetition({ durationMinutes: 10, difficulty: 'easy', winRule: 'total' });
    stepCompetition(c, 12.5);
    expect(recordCatch(c, perch(0.2))?.time).toBe(12.5);
    expect(recordCatch(c, perch(0.25), { x: 3, y: -4 })?.at).toEqual({ x: 3, y: -4 });
    stepCompetition(c, 600);
    expect(recordCatch(c, perch(0.3))).toBeNull();
    expect(c.catches).toHaveLength(2);
  });

  it('yhteenveto voittoehdon mukaan', () => {
    const catches = [perch(0.2), perch(0.45), perch(0.1)].map((p, i) => ({ ...p, time: i }));
    const total = summarize(catches, 'total');
    expect(total.count).toBe(3);
    expect(total.total).toBeCloseTo(0.75);
    expect(total.score).toBeCloseTo(0.75);
    expect(total.biggest?.weight).toBe(0.45);
    expect(summarize(catches, 'biggest').score).toBe(0.45);
    expect(summarize([], 'biggest')).toEqual({ count: 0, total: 0, biggest: null, score: 0 });
  });

  it('muotoilee ajan', () => {
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(65.2)).toBe('1:06');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(4325)).toBe('1:12:05');
  });
});
