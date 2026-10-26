/**
 * Hakee pelikoneelta viemättömät palautteet ja tekee jokaisesta GitHub-issuen
 * tunnisteella `palaute` (ks. feedback/issues.ts). Ajetaan GitHub Actionsissa
 * (.github/workflows/palautteet.yml): `pnpm --filter @lunki/server feedback-issues`.
 *
 * Ympäristö: LUNKI_SERVER_URL (wss:// tai https://), LUNKI_FEEDBACK_TOKEN,
 * GITHUB_TOKEN ja GITHUB_REPOSITORY (omistaja/repo).
 *
 * Kiinni oleva pelikone ei ole virhe: ajo päättyy siististi ja palautteet
 * haetaan seuraavalla kerralla. Väärä avain on virhe, jotta se huomataan.
 */
import {
  FEEDBACK_EXPORTED_PATH,
  FEEDBACK_LABEL,
  FEEDBACK_PENDING_PATH,
  feedbackIdOf,
  issueBody,
  issueTitle,
} from './feedback/issues';
import type { PendingFeedback } from './feedback/store';

const env = (name: string) => process.env[name]?.trim() ?? '';
const serverUrl = env('LUNKI_SERVER_URL')
  .replace(/^ws(s?):\/\//, 'http$1://')
  .replace(/\/+$/, '');
const token = env('LUNKI_FEEDBACK_TOKEN');
const repo = env('GITHUB_REPOSITORY');
const ghToken = env('GITHUB_TOKEN');
const ghApi = env('GITHUB_API_URL') || 'https://api.github.com';

function done(msg: string): never {
  console.log(msg);
  process.exit(0);
}

if (!serverUrl || !token)
  done('LUNKI_SERVER_URL tai LUNKI_FEEDBACK_TOKEN puuttuu, palautteita ei haeta.');
if (!repo || !ghToken) throw new Error('GITHUB_REPOSITORY ja GITHUB_TOKEN tarvitaan.');

const server = (path: string, init: RequestInit = {}) =>
  fetch(`${serverUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    signal: AbortSignal.timeout(15_000),
  });

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ghApi}/repos/${repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${ghToken}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  return (await res.json()) as T;
}

let res: Response;
try {
  res = await server(FEEDBACK_PENDING_PATH);
} catch (e) {
  done(`Pelipalvelin ei vastannut (${(e as Error).message}), yritetään myöhemmin.`);
}
if (res.status === 401)
  throw new Error('Pelipalvelin hylkäsi avaimen: tarkista LUNKI_FEEDBACK_TOKEN.');
// Cloudflaren haaste (Bot Fight Mode tms.) ei mene ohi itsestään, joten se on virhe.
if (res.status === 403)
  throw new Error(
    'Pelipalvelin vastasi 403: Cloudflare todennäköisesti esti Actionsin (Bot Fight Mode), ks. docs/windows-palvelin.md.',
  );
// Cloudflare vastaa 502, kun palvelin ei ole päällä, ja 530 (virhe 1033), kun
// tunneli ei ole; Funnel vastaa 502. Vanha palvelinversio vastaa 404.
if (!res.ok) done(`Pelipalvelin vastasi ${res.status}, yritetään myöhemmin.`);
const { feedback } = (await res.json()) as { feedback: PendingFeedback[] };
if (feedback.length === 0) done('Ei uusia palautteita.');

// Jos edellinen ajo teki issuen mutta kuittaus jäi tekemättä, ei tehdä toista.
// Issue on päivitetty palautteen jälkeen, joten haku rajataan siihen.
const existing = new Map<number, number>();
const since = new Date(Date.parse(feedback[0]!.at) - 86_400_000).toISOString();
for (let page = 1; page <= 10; page++) {
  const issues = await github<{ number: number; body: string | null }[]>(
    `/issues?state=all&per_page=100&page=${page}&since=${since}`,
  );
  for (const i of issues) {
    const id = feedbackIdOf(i.body);
    if (id !== null) existing.set(id, i.number);
  }
  if (issues.length < 100) break;
}

try {
  await github('/labels', {
    method: 'POST',
    body: JSON.stringify({
      name: FEEDBACK_LABEL,
      color: 'c5def5',
      description: 'Pelaajan palaute, odottaa Luukan validointia',
    }),
  });
} catch {
  // Tunniste on jo olemassa.
}

for (const f of feedback) {
  let issue = existing.get(f.id);
  if (issue === undefined) {
    ({ number: issue } = await github<{ number: number }>('/issues', {
      method: 'POST',
      body: JSON.stringify({ title: issueTitle(f), body: issueBody(f), labels: [FEEDBACK_LABEL] }),
    }));
    console.log(`Palaute ${f.id} → issue #${issue}`);
  }
  const ack = await server(FEEDBACK_EXPORTED_PATH, {
    method: 'POST',
    body: JSON.stringify({ id: f.id, issue }),
  });
  if (!ack.ok) throw new Error(`Kuittaus palautteelle ${f.id} epäonnistui: ${ack.status}`);
}
console.log(`${feedback.length} palautetta viety.`);
