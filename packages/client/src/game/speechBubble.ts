import type { EmoteId } from '@lunki/shared';
import { emoteIcon } from '../ui/emoteIcons';

/** Kuplan kesto (ms): ele ja chat-viesti. */
export const EMOTE_BUBBLE_MS = 3000;
export const CHAT_BUBBLE_MS = 5000;
/** Chat-viesti lyhennetään kuplaan näin moneen merkkiin. */
export const BUBBLE_CHARS = 40;
/** Tätä kauempana (m) kupla pienenee ja näyttää viestistä vain merkin. */
export const FAR_BUBBLE = 45;

export type BubbleContent = { emote: EmoteId } | { text: string };

/** Chat-viesti kuplaan: pitkä lyhennetään ja perään "…". */
export function bubbleText(text: string): string {
  const chars = [...text];
  return chars.length <= BUBBLE_CHARS ? text : `${chars.slice(0, BUBBLE_CHARS - 1).join('')}…`;
}

/**
 * Puhekupla pelaajan nimilapun yllä (#228): käsimerkin ikoni tai lyhennetty
 * chat-viesti. Paikka annetaan näytön koordinaateissa.
 */
export class SpeechBubble {
  readonly el: HTMLDivElement;
  private until = 0;
  private readonly full: HTMLSpanElement;
  private readonly short: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'speech-bubble';
    this.el.hidden = true;
    this.full = document.createElement('span');
    this.short = document.createElement('span');
    this.short.className = 'speech-short';
    this.short.textContent = '…';
    parent.appendChild(this.el);
  }

  show(content: BubbleContent, now = performance.now()): void {
    if ('emote' in content) {
      this.el.replaceChildren(emoteIcon(content.emote));
      this.until = now + EMOTE_BUBBLE_MS;
    } else {
      this.full.textContent = bubbleText(content.text);
      this.el.replaceChildren(this.full, this.short);
      this.until = now + CHAT_BUBBLE_MS;
    }
  }

  /** Kuplan paikka (näytön px, `null` = ei näkyvissä) ja onko pelaaja kaukana. */
  place(at: { x: number; y: number } | null, far: boolean, now = performance.now()): void {
    const shown = at !== null && now < this.until;
    this.el.hidden = !shown;
    if (!shown) return;
    this.el.classList.toggle('far', far);
    this.el.style.left = `${at.x}px`;
    this.el.style.top = `${at.y}px`;
  }

  remove(): void {
    this.el.remove();
  }
}
