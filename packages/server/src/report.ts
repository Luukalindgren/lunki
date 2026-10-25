/**
 * Tulostaa testaajien palautteet ja selainten virheet tietokannasta:
 * `pnpm --filter @lunki/server report` (sama LUNKI_DB kuin palvelimella).
 */
import { cleanMultiline } from '@lunki/shared';
import { openDatabase } from './db/open';
import { FeedbackStore } from './feedback/store';

const store = new FeedbackStore(openDatabase(process.env.LUNKI_DB ?? 'data/lunki.sqlite'));

// Vanhoissa riveissä voi olla ohjausmerkkejä, jotka ohjaisivat päätettä.
const clean = <T extends object>(row: T): T =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? cleanMultiline(v) : v]),
  ) as T;

const feedback = store.feedback().map(clean);
console.log(`\n== Palaute (${feedback.length} uusinta) ==`);
for (const f of feedback)
  console.log(
    `\n[${f.at.slice(0, 16).replace('T', ' ')}] ${f.name || 'nimetön'}\n${f.text}\n  (${f.context})`,
  );

const errors = store.errors().map(clean);
console.log(`\n== Virheet (${errors.length}) ==`);
for (const e of errors)
  console.log(
    `\n${e.count}× ${e.message}\n  ${e.source}\n  viimeksi ${e.last}, ensin ${e.first}\n  (${e.context})`,
  );
