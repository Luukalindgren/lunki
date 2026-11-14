import { describe, expect, it } from 'vitest';
import { lineParts, lineText } from './columns';

describe('sarakkeisiin tasattu rivi (#730)', () => {
  it('tavallinen rivi on yksi pala', () => {
    expect(lineParts('Tulostaulu')).toEqual([{ text: 'Tulostaulu' }]);
    expect(lineParts('')).toEqual([]);
    expect(lineText('Tulostaulu')).toBe('Tulostaulu');
  });

  it('sarakkeet ja niiden välit ovat peräkkäin rivin teksti', () => {
    const name = { text: 'Sinä      ' };
    const score = { text: '3,53 kg'.padStart(8), right: true };
    const line = { text: `>1. ${name.text} ${score.text}`, columns: [name, score] };
    const parts = lineParts(line);
    expect(parts.map((p) => p.text).join('')).toBe(line.text);
    expect(parts).toEqual([
      { text: '>1. ' },
      { text: name.text, column: name },
      { text: ' ' },
      { text: score.text, column: score },
    ]);
  });

  it('sama teksti kahdessa sarakkeessa löytyy järjestyksessä', () => {
    const a = { text: ' 2', right: true };
    const b = { text: ' 2', right: true };
    const parts = lineParts({ text: 'x  2 kpl  2 kg', columns: [a, b] });
    expect(parts.map((p) => p.text)).toEqual(['x ', ' 2', ' kpl ', ' 2', ' kg']);
    expect(parts[1]!.column).toBe(a);
    expect(parts[3]!.column).toBe(b);
  });

  it('rivistä puuttuva sarake jää pois eikä siirrä muita', () => {
    const parts = lineParts({ text: '…', columns: [{ text: 'nimi' }] });
    expect(parts).toEqual([{ text: '…' }]);
  });
});
