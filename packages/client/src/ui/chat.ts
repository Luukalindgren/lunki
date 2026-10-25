import { CHAT_MAX_LENGTH, ChatLimiter, sanitizeChat } from '@lunki/shared';
import type { NetSession } from '../net/session';

const OLD_SERVER =
  'Palvelin on vanhempaa versiota: chat toimii, kun palvelin käynnistetään uudelleen.';

/** Kisan aikana viesti näkyy näin kauan (ms). */
const HUD_SHOW_MS = 12_000;
/** Kisan aikana näkyvät viimeisimmät viestit (kirjoittaessa enemmän). */
const HUD_LINES = 5;
const HUD_TYPING_LINES = 10;

/**
 * Moninpelin chat. Sama elementti siirtyy aulaan, kisan HUD:iin ja
 * tulossivulle (mount). Aulassa kirjoituskenttä on aina näkyvissä; kisan
 * aikana Enter (tai kosketusnäytöllä VIESTI) avaa sen ja Esc sulkee.
 * Kirjoittaminen ei ohjaa peliä, koska Input ohittaa tekstikenttien näppäimet.
 */
export class ChatBox {
  readonly root: HTMLDivElement;
  /** Kirjoituskenttä avautui kisan aikana: pelin pohjassa olevat näppäimet irti. */
  onOpen: (() => void) | null = null;
  private readonly log: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly field: HTMLInputElement;
  private readonly limiter = new ChatLimiter();
  private mode: 'panel' | 'hud' = 'panel';
  /** Milloin viesti saapui tähän selaimeen (id → ms), häivytystä varten. */
  private readonly seenAt = new Map<number, number>();
  private notice: { text: string; until: number } | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly session: NetSession) {
    this.root = document.createElement('div');
    this.log = document.createElement('div');
    this.log.className = 'chat-log';
    this.log.setAttribute('aria-live', 'polite');
    this.form = document.createElement('form');
    this.form.className = 'chat-form';
    this.field = document.createElement('input');
    this.field.type = 'text';
    this.field.maxLength = CHAT_MAX_LENGTH;
    this.field.placeholder = 'Kirjoita viesti muille…';
    this.field.autocomplete = 'off';
    this.field.enterKeyHint = 'send';
    this.field.setAttribute('aria-label', 'Chat-viesti');
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Lähetä';
    this.form.append(this.field, send);
    this.root.append(this.log, this.form);

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    this.field.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      this.field.value = '';
      this.close();
    });
    // Kisan aikana klikkaus pelikuvaan sulkee kentän (teksti säilyy).
    this.field.addEventListener('blur', () => {
      if (this.mode === 'hud') this.close();
    });
    window.addEventListener('keydown', this.onKey);
    session.onChat = () => this.render();
    session.onChatRejected = () => this.say('Liian monta viestiä – odota hetki.');
    this.timer = setInterval(() => {
      if (this.mode === 'hud') this.render();
    }, 1000);
    this.render();
  }

  /** Siirtää chatin aulaan / tulossivulle ('panel') tai kisan HUD:iin ('hud'). */
  mount(parent: HTMLElement, mode: 'panel' | 'hud'): void {
    const focused = document.activeElement === this.field;
    const [start, end] = [this.field.selectionStart, this.field.selectionEnd];
    this.mode = mode;
    this.root.className = `chat chat-${mode}`;
    this.form.hidden = mode === 'hud';
    if (this.root.parentElement !== parent) parent.appendChild(this.root);
    // Aula piirretään uudelleen tilan muuttuessa: kirjoitus jatkuu keskeytyksettä.
    // Uusi paneeli on sivulla vasta piirron jälkeen, siksi mikrotehtävänä.
    if (focused && mode === 'panel') {
      queueMicrotask(() => {
        this.field.focus({ preventScroll: true });
        this.field.setSelectionRange(start, end);
      });
    }
    this.render();
  }

  /** Avaa kirjoituskentän kisan aikana. */
  open(): void {
    if (this.mode !== 'hud' || this.typing) return;
    if (!this.session.chatAvailable) {
      this.say(OLD_SERVER);
      return;
    }
    this.form.hidden = false;
    this.root.classList.add('typing');
    this.onOpen?.();
    this.field.focus({ preventScroll: true });
    this.render();
  }

  get typing(): boolean {
    return this.mode === 'hud' && !this.form.hidden;
  }

  dispose(): void {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    if (this.session.onChat) this.session.onChat = null;
    this.session.onChatRejected = null;
    this.root.remove();
  }

  private close(): void {
    if (this.mode !== 'hud') {
      this.field.blur();
      return;
    }
    if (this.form.hidden) return;
    this.form.hidden = true;
    this.root.classList.remove('typing');
    if (document.activeElement === this.field) this.field.blur();
    this.render();
  }

  private send(): void {
    const text = sanitizeChat(this.field.value);
    if (!text) {
      this.close();
      return;
    }
    if (!this.session.chatAvailable) {
      this.say(OLD_SERVER);
      return;
    }
    if (!this.limiter.take(Date.now())) {
      this.say('Liian monta viestiä – odota hetki.');
      return;
    }
    this.session.sendChat(text);
    this.field.value = '';
    if (this.mode === 'hud') this.close();
  }

  /** Paikallinen ilmoitus chatin alle (ei mene muille). */
  private say(text: string): void {
    this.notice = { text, until: performance.now() + 4000 };
    this.render();
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.mode !== 'hud' || this.typing || e.repeat) return;
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // HUD piilossa (tauko): ei avata.
    if (this.root.getClientRects().length === 0) return;
    e.preventDefault();
    this.open();
  };

  private render(): void {
    const now = performance.now();
    for (const m of this.session.chat) if (!this.seenAt.has(m.id)) this.seenAt.set(m.id, now);
    let messages = this.session.chat;
    if (this.mode === 'hud') {
      messages = this.typing
        ? messages.slice(-HUD_TYPING_LINES)
        : messages.slice(-HUD_LINES).filter((m) => now - this.seenAt.get(m.id)! < HUD_SHOW_MS);
    }
    const me = this.session.sessionId;
    const lines: HTMLElement[] = messages.map((m) => {
      const line = document.createElement('div');
      line.className = m.from === me ? 'chat-line me' : 'chat-line';
      const name = document.createElement('span');
      name.className = 'chat-name';
      name.textContent = `${m.name}:`;
      line.append(name, ` ${m.text}`);
      return line;
    });
    if (this.notice && now < this.notice.until) {
      const n = document.createElement('div');
      n.className = 'chat-line chat-notice';
      n.textContent = this.notice.text;
      lines.push(n);
    } else this.notice = null;
    // Vanha palvelin katkaisisi yhteyden chat-viestistä: kenttä pois käytöstä.
    const available = this.session.chatAvailable;
    this.field.disabled = !available;
    if (!available && this.mode === 'panel') {
      const old = document.createElement('div');
      old.className = 'chat-line chat-notice';
      old.textContent = OLD_SERVER;
      lines.push(old);
    } else if (lines.length === 0 && this.mode === 'panel') {
      const empty = document.createElement('div');
      empty.className = 'chat-line chat-notice';
      empty.textContent = 'Ei viestejä vielä.';
      lines.push(empty);
    }
    // Ei turhaa uudelleenpiirtoa joka sekunti.
    const key = lines.map((l) => l.className + l.textContent).join('\n');
    if (this.log.dataset.key !== key) {
      this.log.dataset.key = key;
      this.log.replaceChildren(...lines);
      this.log.scrollTop = this.log.scrollHeight;
    }
    this.log.hidden = lines.length === 0;
  }
}
