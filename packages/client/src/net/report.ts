import {
  ERRORS_PATH,
  FEEDBACK_LIMITS,
  FEEDBACK_PATH,
  type ErrorReport,
  type FeedbackMessage,
} from '@lunki/shared';
import { serverHttpUrl } from './session';

/** Julkaistun version tunniste (GitHub Pages -koonnin commit), kehityksessä "dev". */
const VERSION = ((import.meta.env.VITE_COMMIT as string | undefined) ?? 'dev').slice(0, 7);

/** Selain ja versio palautteen ja virheiden yhteyteen. */
export function reportContext(extra = ''): string {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  const ctx = `${VERSION} · ${innerWidth}×${innerHeight} · ${ua}${extra ? ` · ${extra}` : ''}`;
  return ctx.slice(0, FEEDBACK_LIMITS.context);
}

/** Lähetyksen tulos: perillä, palvelin hylkäsi, tai palvelinta ei tavoitettu. */
export type SendResult = 'sent' | 'rejected' | 'offline';

async function post(path: string, body: unknown, timeoutMs = 6000): Promise<SendResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // text/plain ei vaadi CORS-esikyselyä; palvelin jäsentää JSONin itse.
    const res = await fetch(`${serverHttpUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.ok) return 'sent';
    // Cloudflare vastaa itse, kun tunnelin takana oleva kone on kiinni.
    return res.status >= 500 ? 'offline' : 'rejected';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

const PENDING_KEY = 'lunki.feedback.pending';
/** Näin monta lähettämätöntä palautetta pidetään tallessa. */
const MAX_PENDING = 10;

function loadPending(): FeedbackMessage[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(v) ? (v as FeedbackMessage[]) : [];
  } catch {
    return [];
  }
}

function savePending(list: FeedbackMessage[]): void {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // ei haittaa
  }
}

/**
 * Lähettää palautteen. Jos palvelin on kiinni, palaute jää selaimeen
 * odottamaan ('offline') ja lähtee seuraavalla kerralla, kun palvelin vastaa.
 */
export async function sendFeedback(f: FeedbackMessage): Promise<SendResult> {
  const result = await post(FEEDBACK_PATH, f);
  if (result === 'offline') savePending([...loadPending(), f]);
  else if (result === 'sent') void flushFeedback();
  return result;
}

let flushing = false;

/** Lähettää aiemmin tallentuneet palautteet, kunnes palvelin ei vastaa. */
export async function flushFeedback(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    // Yläraja: jos tallennus ei onnistu, sama palaute ei saa lähteä loputtomiin.
    for (let i = 0; i < MAX_PENDING; i++) {
      const next = loadPending()[0];
      if (!next) return;
      const result = await post(FEEDBACK_PATH, next);
      if (result === 'offline') return;
      // Perillä tai hylätty: hylättyä ei kannata yrittää uudelleen.
      savePending(loadPending().slice(1));
    }
  } finally {
    flushing = false;
  }
}

/** Enintään näin monta virheraporttia sivun latausta kohden. */
const MAX_REPORTS = 5;

/**
 * Lähettää käsittelemättömät virheet pelipalvelimelle, jotta testaajien
 * ongelmat näkyvät `pnpm report` -tulosteessa. Vain julkaistussa versiossa.
 */
export function installErrorReporting(): void {
  if (!import.meta.env.PROD) return;
  const sent = new Set<string>();
  /** Palvelin on kiinni: virheitä ei yritetä lähettää enää tällä latauksella. */
  let offline = false;
  const report = (e: ErrorReport) => {
    if (offline || sent.size >= MAX_REPORTS || sent.has(e.message)) return;
    sent.add(e.message);
    // Palvelin katkaisee kentät joka tapauksessa; pitkää pinoa ei kannata lähettää.
    void post(ERRORS_PATH, {
      message: e.message.slice(0, FEEDBACK_LIMITS.message),
      source: e.source.slice(0, FEEDBACK_LIMITS.context),
      stack: e.stack.slice(0, FEEDBACK_LIMITS.stack),
      context: e.context,
    }).then((r) => (offline ||= r === 'offline'));
  };
  addEventListener('error', (ev) => {
    if (!ev.message) return;
    report({
      message: ev.message,
      source: ev.filename ? `${ev.filename.split('/').pop()}:${ev.lineno}:${ev.colno}` : '',
      stack: ev.error instanceof Error ? (ev.error.stack ?? '') : '',
      context: reportContext(),
    });
  });
  addEventListener('unhandledrejection', (ev) => {
    const err: unknown = ev.reason;
    report({
      message: err instanceof Error ? err.message : String(err),
      source: 'promise',
      stack: err instanceof Error ? (err.stack ?? '') : '',
      context: reportContext(),
    });
  });
}
