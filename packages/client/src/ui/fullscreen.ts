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

export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
      return;
    }
    const root = document.documentElement as WebkitElement;
    await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
    // Chromiumissa Esc jää peliin (taukovalikko); koko näytöstä pääsee
    // pitämällä Esciä pohjassa tai valikon napista.
    await (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
      ?.lock?.(['Escape'])
      .catch(() => undefined);
  } catch {
    // Selain kieltäytyi (esim. ei käyttäjän painallusta): pysytään ikkunassa.
  }
}

function label(): string {
  return isFullscreen() ? t('fullscreen.exit') : t('fullscreen.enter');
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
  const refresh = () => {
    for (const b of document.querySelectorAll<HTMLButtonElement>('.fullscreen-toggle'))
      b.textContent = label();
  };
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);
}
