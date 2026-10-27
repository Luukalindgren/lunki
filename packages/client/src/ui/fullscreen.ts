import { t } from '../i18n';

/**
 * Koko näytön tila ilman selaimen palkkeja. Fullscreen API toimii
 * tietokoneilla, Androidilla ja iPadilla; iPhonen Safari ei päästä sivua koko
 * näytölle, joten siellä neuvotaan lisäämään peli Koti-valikkoon (manifesti
 * avaa sen silloin ilman Safarin palkkeja).
 */

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

const doc = (): WebkitDocument => document as WebkitDocument;

/** Selain osaa koko näytön tilan (iPhonella ei). */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(doc().fullscreenElement ?? doc().webkitFullscreenElement);
}

/** Peli on avattu Koti-valikon kuvakkeesta (ei selaimen palkkeja). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const media = (q: string) => window.matchMedia?.(q).matches ?? false;
  return (
    // Chromiumissa myös Fullscreen API täsmää display-mode: fullscreen -kyselyyn.
    (media('(display-mode: fullscreen)') && !isFullscreen()) ||
    media('(display-mode: standalone)') ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Kosketuslaite ilman koko näytön tilaa (iPhone Safari): näytetään ohje. */
export function needsHomeScreenHint(): boolean {
  if (typeof window === 'undefined' || fullscreenSupported() || isStandalone()) return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

const keyboard = (): KeyboardLock | undefined =>
  (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/**
 * Chromium (Chrome, Edge, Opera) lukitsee Escin peliin: lyhyt painallus
 * avaa tai sulkee valikon, ja koko näytöstä poistutaan pitämällä Esciä
 * pohjassa. Firefox ja Safari eivät tätä salli, vaan Esc poistuu aina koko
 * näytöstä.
 */
let escLocked = false;
/** Koko näyttö päällä viime tapahtumassa (Safari lähettää sekä etuliitteellisen että tavallisen). */
let shown = false;
/** Poistuminen tulee omasta napista, ei selaimelta. */
let leaving = false;
/**
 * Selain pudotti koko näytöstä Escillä ilman lukitusta: palataan seuraavasta
 * painalluksesta (koko näytön pyyntö vaatii käyttäjän eleen).
 */
let resumePending = false;
let lastEscape = -Infinity;
let fakeEscape = -Infinity;

/** Pelaaja on valinnut koko näytön (myös hetkellisesti pudonneena). */
export function fullscreenWanted(): boolean {
  return isFullscreen() || resumePending;
}

/** Esc pudottaa tässä selaimessa hetkeksi pois koko näytöstä (Firefox, Safari). */
export function escapeLeavesFullscreen(): boolean {
  return fullscreenWanted() && !escLocked;
}

async function enterFullscreen(): Promise<void> {
  const root = document.documentElement as WebkitElement;
  await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
  escLocked = await (keyboard()
    ?.lock?.(['Escape'])
    .then(() => true)
    .catch(() => false) ?? false);
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (fullscreenWanted()) {
      resumePending = false;
      if (!isFullscreen()) return;
      leaving = true;
      await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
      return;
    }
    await enterFullscreen();
  } catch {
    // Selain kieltäytyi (esim. ei käyttäjän painallusta): pysytään ikkunassa.
    leaving = false;
  }
}

/**
 * Ilman lukitusta selain syö Escin poistuessaan koko näytöstä. Annetaan se
 * peliin itse, jotta valikko avautuu tai sulkeutuu kuten pelaaja halusi.
 */
function dispatchEscape(): void {
  fakeEscape = performance.now();
  const target = document.activeElement ?? document.body;
  for (const type of ['keydown', 'keyup'])
    target.dispatchEvent(
      new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
    );
}

function onFullscreenChange(): void {
  if (isFullscreen() === shown) return;
  shown = isFullscreen();
  if (shown) {
    resumePending = false;
  } else {
    const byBrowser = !leaving && !escLocked;
    leaving = false;
    escLocked = false;
    keyboard()?.unlock?.();
    if (byBrowser && document.visibilityState === 'visible' && document.hasFocus()) {
      resumePending = true;
      if (performance.now() - lastEscape > 500) dispatchEscape();
    }
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.fullscreen-toggle'))
    b.textContent = label();
}

function onKeyCapture(e: KeyboardEvent): void {
  if (e.code !== 'Escape' || !e.isTrusted) return;
  // Selain antoi Escin sittenkin itse koko näytön jälkeen: ei tuplana.
  if (performance.now() - fakeEscape < 500) {
    e.stopImmediatePropagation();
    return;
  }
  lastEscape = performance.now();
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

/** Mikä tahansa painallus palauttaa Escillä pudonneen koko näytön. */
function resumeOnGesture(e: Event): void {
  if (!resumePending || isFullscreen() || !e.isTrusted) return;
  if (e instanceof KeyboardEvent && (e.code === 'Escape' || MODIFIERS.has(e.key))) return;
  // Koko näytön nappi päättää itse (sillä pysytään ikkunassa).
  if (e.target instanceof Element && e.target.closest('.fullscreen-toggle')) return;
  resumePending = false;
  enterFullscreen().catch(() => {
    // Näppäimestä ei aina saa koko näyttöä: yritetään vielä klikkauksesta.
    if (e instanceof KeyboardEvent) resumePending = true;
  });
}

function label(): string {
  return fullscreenWanted() ? t('fullscreen.exit') : t('fullscreen.enter');
}

/** Koko näytön nappi valikoihin; teksti seuraa tilaa (myös Esc-poistumista). */
export function fullscreenButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'fullscreen-toggle';
  b.textContent = label();
  b.addEventListener('click', () => void toggleFullscreen().then(() => (b.textContent = label())));
  return b;
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  window.addEventListener('keydown', onKeyCapture, true);
  window.addEventListener('keydown', resumeOnGesture, true);
  window.addEventListener('pointerdown', resumeOnGesture, true);
}
