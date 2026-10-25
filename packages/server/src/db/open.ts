import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Avaa palvelimen SQLite-tiedoston (hakemisto luodaan tarvittaessa). ':memory:' testeille. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  return new DatabaseSync(path);
}
