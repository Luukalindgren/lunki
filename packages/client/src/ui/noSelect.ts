/**
 * Puhelimella pelikuvan painelu ei saa valita HUD-tekstejä eikä avata
 * selaimen Kopioi/Etsi-valikkoa (iOS Safari). CSS (user-select,
 * -webkit-touch-callout) hoitaa suurimman osan; nämä estävät loput
 * valinnan aloitukset ja pitkän painalluksen valikon. Syöttökentät (nimi,
 * huonekoodi, chat, palaute) ja huonekoodi toimivat kuten ennenkin.
 */
export function allowsSelection(target: EventTarget | null): boolean {
  // selectstartin kohde voi olla tekstisolmu: katsotaan sen vanhempaa.
  const el =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return !!el?.closest('input, textarea, [contenteditable], .room-code');
}

export function preventTextSelection(doc: Document = document): void {
  const block = (e: Event) => {
    if (!allowsSelection(e.target)) e.preventDefault();
  };
  doc.addEventListener('selectstart', block);
  doc.addEventListener('contextmenu', block);
}
