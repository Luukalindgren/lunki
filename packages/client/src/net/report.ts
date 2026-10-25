import {
  ERRORS_PATH,
  FEEDBACK_LIMITS,
  FEEDBACK_PATH,
  type ErrorReport,
  type FeedbackMessage,
} from '@lunki/shared';
import { serverUrl } from './session';

/** Julkaistun version tunniste (GitHub Pages -koonnin commit), kehityksessä "dev". */
const VERSION = ((import.meta.env.VITE_COMMIT as string | undefined) ?? 'dev').slice(0, 7);

/** Selain ja versio palautteen ja virheiden yhteyteen. */
export function reportContext(extra = ''): string {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  const ctx = `${VERSION} · ${innerWidth}×${innerHeight} · ${ua}${extra ? ` · ${extra}` : ''}`;
  return ctx.slice(0, FEEDBACK_LIMITS.context);
}

async function post(path: string, body: unknown): Promise<boolean> {
  const http = serverUrl().replace(/^ws/, 'http').replace(/\/$/, '');
  try {
    // text/plain ei vaadi CORS-esikyselyä; palvelin jäsentää JSONin itse.
    const res = await fetch(`${http}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const sendFeedback = (f: FeedbackMessage) => post(FEEDBACK_PATH, f);

/** Enintään näin monta virheraporttia sivun latausta kohden. */
const MAX_REPORTS = 5;

/**
 * Lähettää käsittelemättömät virheet pelipalvelimelle, jotta testaajien
 * ongelmat näkyvät `pnpm report` -tulosteessa. Vain julkaistussa versiossa.
 */
export function installErrorReporting(): void {
  if (!import.meta.env.PROD) return;
  const sent = new Set<string>();
  const report = (e: ErrorReport) => {
    if (sent.size >= MAX_REPORTS || sent.has(e.message)) return;
    sent.add(e.message);
    void post(ERRORS_PATH, e);
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
