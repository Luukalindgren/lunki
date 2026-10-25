import { cleanMultiline } from './text';

/** Testaajan palaute pelin valikosta. */
export interface FeedbackMessage {
  /** Nimimerkki (voi olla tyhjä). */
  name: string;
  text: string;
  /** Selain, pelin versio ja tilanne, josta palaute lähetettiin. */
  context: string;
}

/** Selaimessa sattunut käsittelemätön virhe. */
export interface ErrorReport {
  message: string;
  /** Tiedosto ja rivi, josta virhe tuli (tyhjä, jos ei tiedossa). */
  source: string;
  stack: string;
  context: string;
}

export const FEEDBACK_PATH = '/feedback';
export const ERRORS_PATH = '/errors';

/** Kenttien enimmäispituudet: pidemmät katkaistaan. */
export const FEEDBACK_LIMITS = { name: 32, text: 2000, context: 300, message: 300, stack: 2000 };

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? cleanMultiline(v.slice(0, max)).trim() : '';

/** Siistii palautteen; tyhjä teksti ei kelpaa. */
export function parseFeedback(v: unknown): FeedbackMessage | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const text = str(o.text, FEEDBACK_LIMITS.text);
  if (!text) return null;
  return {
    name: str(o.name, FEEDBACK_LIMITS.name),
    text,
    context: str(o.context, FEEDBACK_LIMITS.context),
  };
}

export function parseErrorReport(v: unknown): ErrorReport | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const message = str(o.message, FEEDBACK_LIMITS.message);
  if (!message) return null;
  return {
    message,
    source: str(o.source, FEEDBACK_LIMITS.context),
    stack: str(o.stack, FEEDBACK_LIMITS.stack),
    context: str(o.context, FEEDBACK_LIMITS.context),
  };
}
