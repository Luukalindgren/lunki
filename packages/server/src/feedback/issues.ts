/**
 * Palautteiden vienti GitHub-issueiksi: rajapinnan polut ja issuen teksti.
 * Hakija on feedbackIssues.ts (GitHub Actions, .github/workflows/palautteet.yml).
 */
import type { PendingFeedback } from './store';

/** GET: viemättömät palautteet. Vaatii avaimen (feedback/token.ts). */
export const FEEDBACK_PENDING_PATH = '/feedback/pending';
/** POST {id, issue}: palaute on viety issueen. Vaatii avaimen. */
export const FEEDBACK_EXPORTED_PATH = '/feedback/exported';

/** Tunniste, joka kertoo, ettei issueta aloiteta ennen Luukan hyväksyntää. */
export const FEEDBACK_LABEL = 'palaute';

const MARKER = /<!-- lunki-palaute:(\d+) -->/;

/** Issuen rungosta palautteen tunnus, jos issue on tehty palautteesta. */
export function feedbackIdOf(body: string | null | undefined): number | null {
  const m = body ? MARKER.exec(body) : null;
  return m ? Number(m[1]) : null;
}

export function issueTitle(f: PendingFeedback): string {
  const first = f.text.split('\n').find((l) => l.trim()) ?? '';
  const line = first.trim().replace(/\s+/g, ' ');
  return `Palaute: ${line.length > 60 ? `${line.slice(0, 59)}…` : line}`;
}

/** Lyhyt kenttä koodina: koodissa @maininnat ja #viittaukset eivät linkity. */
const inline = (s: string) => `\`${s.replace(/[`\n\r]/g, ' ').trim() || '-'}\``;

/** Pelaajan teksti koodilohkoon, jota teksti ei voi sulkea omilla `-merkeillään. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

export function issueBody(f: PendingFeedback): string {
  return [
    `<!-- lunki-palaute:${f.id} -->`,
    '**Pelaajan palaute pelistä.** Odottaa Luukan validointia: älä aloita työtä ennen kuin ' +
      `Luuka on hyväksynyt sen (vaihtaa \`${FEEDBACK_LABEL}\`-tunnisteen toiseen tai kommentoi).`,
    '',
    `- Lähettäjä: ${f.name ? inline(f.name) : 'nimetön'}`,
    `- Lähetetty: ${f.at.slice(0, 16).replace('T', ' ')} UTC`,
    `- Tilanne: ${inline(f.context)}`,
    '',
    fenced(f.text),
  ].join('\n');
}
