import type { RecordEntry } from '@lunki/shared';
import { submitSoloRecord } from './session';

/** Yksinpelin saalis, joka odottaa lähetystä; saantihetki (`at`) talteen. */
export type SoloCatch = Omit<RecordEntry, 'date'> & { at: string };

/** Jonossa ollut saalis pääsi listalle. */
export interface QueuedPlace {
  entry: SoloCatch;
  place: number;
}

const KEY = 'lunki.solo.pending';
/** Näin monta saalista pidetään tallessa; ylimenevistä pudotetaan kevyimmät. */
const MAX_PENDING = 50;

function load(): SoloCatch[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as SoloCatch[]) : [];
  } catch {
    return [];
  }
}

function save(list: SoloCatch[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // ei haittaa
  }
}

/** Lisää saaliin jonoon (palvelin kiinni). Täydestä jonosta putoaa kevyin. */
export function queueSoloCatch(c: SoloCatch): void {
  const list = [...load(), c];
  while (list.length > MAX_PENDING) {
    const lightest = list.reduce((min, e, i) => (e.weight < list[min]!.weight ? i : min), 0);
    list.splice(lightest, 1);
  }
  save(list);
}

/** Lähettämättömiä saaliita laitteella. */
export const pendingSoloCatches = (): number => load().length;

let flushing: Promise<QueuedPlace[]> | null = null;

/**
 * Lähettää jonossa olevat saaliit vanhimmasta alkaen, kunnes palvelin ei
 * vastaa. Palauttaa ne, jotka pääsivät listalle.
 */
export function flushSoloCatches(): Promise<QueuedPlace[]> {
  return (flushing ??= flush().finally(() => (flushing = null)));
}

async function flush(): Promise<QueuedPlace[]> {
  const placed: QueuedPlace[] = [];
  // Yläraja: jos tallennus ei onnistu, sama saalis ei saa lähteä loputtomiin.
  for (let i = 0; i < MAX_PENDING; i++) {
    const next = load()[0];
    if (!next) break;
    const result = await submitSoloRecord(next);
    if (result === 'offline') break;
    // Perillä tai hylätty: hylättyä ei kannata yrittää uudelleen.
    save(load().slice(1));
    if (result !== 'rejected' && result.place !== null)
      placed.push({ entry: next, place: result.place });
  }
  return placed;
}
