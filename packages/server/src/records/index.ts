import type { RecordStore } from './store';

let store: RecordStore | null = null;

/** Palvelimen ennätystallennus; null = ennätyksiä ei tallenneta. */
export const recordStore = () => store;

export function setRecordStore(s: RecordStore | null): void {
  store = s;
}
