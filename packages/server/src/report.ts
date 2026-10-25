/**
 * Tulostaa testaajien palautteet ja selainten virheet tietokannasta:
 * `pnpm --filter @lunki/server report` (sama LUNKI_DB kuin palvelimella).
 */
import { openDatabase } from './db/open';
import { FeedbackStore } from './feedback/store';

const store = new FeedbackStore(openDatabase(process.env.LUNKI_DB ?? 'data/lunki.sqlite'));

const feedback = store.feedback();
console.log(`\n== Palaute (${feedback.length} uusinta) ==`);
for (const f of feedback)
  console.log(
    `\n[${f.at.slice(0, 16).replace('T', ' ')}] ${f.name || 'nimetön'}\n${f.text}\n  (${f.context})`,
  );

const errors = store.errors();
console.log(`\n== Virheet (${errors.length}) ==`);
for (const e of errors)
  console.log(
    `\n${e.count}× ${e.message}\n  ${e.source}\n  viimeksi ${e.last}, ensin ${e.first}\n  (${e.context})`,
  );
