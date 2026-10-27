import { createHash } from 'node:crypto';

/**
 * Service workerin asennuksessa tallennettavat buildin tiedostot (#328):
 * sivu, koodi, tyylit, fontit, manifesti ja kuvakkeet. Vanhojen selainten
 * .woff-fontit, lähdekartat ja hakukoneiden tiedostot jäävät pois; puheäänet
 * tallennetaan vasta, kun ne on kerran soitettu.
 */
export function precacheList(files: readonly string[]): string[] {
  return files
    .map((f) => f.replaceAll('\\', '/'))
    .filter(
      (f) =>
        f === 'index.html' ||
        f === 'manifest.webmanifest' ||
        f === 'favicon.ico' ||
        f.startsWith('icons/') ||
        (f.startsWith('assets/') && !f.endsWith('.woff') && !f.endsWith('.map')),
    )
    .sort();
}

/** Versiotunniste tiedostojen nimistä ja sisällöstä: mikä tahansa muutos vaihtaa sen. */
export function precacheVersion(files: readonly { name: string; content: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    hash.update(f.name);
    hash.update(f.content);
  }
  return hash.digest('hex').slice(0, 12);
}

/** Täyttää service workerin pohjaan version ja tiedostolistan. */
export function serviceWorkerSource(template: string, version: string, files: string[]): string {
  const source = template
    .replace("'__LUNKI_VERSION__'", JSON.stringify(version))
    .replace("['__LUNKI_PRECACHE__']", JSON.stringify(files.map((f) => `./${f}`)));
  if (source.includes('__LUNKI_')) throw new Error('service workerin pohja ei täyttynyt');
  return source;
}
