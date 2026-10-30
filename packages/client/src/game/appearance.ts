import { parseAppearance, randomAppearance, type Appearance } from '@lunki/shared';
import { profileKey } from '../net/identity';

/** Valitut värit muistetaan selaimessa; ensikerralla arvotaan omat. */
export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(profileKey('appearance'));
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
    localStorage.setItem(profileKey('appearance'), JSON.stringify(a));
  } catch {
    // ei haittaa
  }
}
