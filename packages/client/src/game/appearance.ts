import { parseAppearance, randomAppearance, type Appearance } from '@lunki/shared';

const APPEARANCE_KEY = 'lunki.appearance';

/** Valitut värit muistetaan selaimessa; ensikerralla arvotaan omat. */
export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    const a = raw ? parseAppearance(JSON.parse(raw)) : null;
    if (a) return a;
  } catch {
    // arvotaan uudet
  }
  const a = randomAppearance();
  saveAppearance(a);
  return a;
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    // ei haittaa
  }
}
