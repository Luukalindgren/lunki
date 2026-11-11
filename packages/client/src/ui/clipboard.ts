/**
 * Tekstin kopiointi leikepöydälle. `navigator.clipboard` on vain suojatulla
 * sivulla (https, localhost): LAN-pelissä sivu tulee http-osoitteesta, joten
 * silloin teksti kopioidaan valitsemalla se piilokentästä (`execCommand`).
 * Kutsutaan suoraan painalluksen käsittelijästä. Palauttaa, onnistuiko.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Selain esti (lupa, kohdistus): kokeillaan valintaa.
    }
  }
  return copyBySelection(text);
}

function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  // Vain luku: puhelimen näppäimistö ei aukea. Ruudun ulkopuolelle ei siirretä,
  // koska kohdistus vierittäisi sivua.
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px';
  const focused = document.activeElement as HTMLElement | null;
  document.body.append(field);
  let ok: boolean;
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  focused?.focus?.({ preventScroll: true });
  return ok;
}
