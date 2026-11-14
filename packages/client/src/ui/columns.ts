/**
 * Sarakkeisiin tasattu tekstirivi. Tulostaulujen rivit tasataan välilyönneillä
 * (`padEnd`, `padStart`), mikä asettuu kohdakkain vain tasalevyisellä fontilla
 * (Retro, Terävä). Modernin tekstifontissa merkit ovat eri levyisiä (#730),
 * joten rivin tasatut osat kääritään sarakkeiksi, joiden leveys on osan pituus
 * merkkeinä (`.col`, `style.css`). Rivin teksti pysyy samana, joten
 * tasalevyisellä fontilla mikään ei muutu.
 */

/** Rivin tasattu osa täytteineen; `right` = tasattu oikeaan reunaan (luvut). */
export interface Column {
  text: string;
  right?: boolean;
}

/** Rivi ja sen tasatut osat siinä järjestyksessä, jossa ne ovat tekstissä. */
export interface AlignedLine {
  text: string;
  columns: readonly Column[];
}

/** Tavallinen rivi tai sarakkeisiin tasattu rivi. */
export type Line = string | AlignedLine;

export const lineText = (line: Line): string => (typeof line === 'string' ? line : line.text);

/** Rivin pala: sarake tai sarakkeiden välinen teksti. */
export interface LinePart {
  text: string;
  column?: Column;
}

/** Jakaa rivin sarakkeisiin ja niiden väleihin; palat peräkkäin ovat rivin teksti. */
export function lineParts(line: Line): LinePart[] {
  if (typeof line === 'string') return line ? [{ text: line }] : [];
  const parts: LinePart[] = [];
  let at = 0;
  for (const column of line.columns) {
    const i = column.text ? line.text.indexOf(column.text, at) : -1;
    if (i < 0) continue;
    if (i > at) parts.push({ text: line.text.slice(at, i) });
    parts.push({ text: column.text, column });
    at = i + column.text.length;
  }
  if (at < line.text.length) parts.push({ text: line.text.slice(at) });
  return parts;
}

/** Rivi elementteinä: sarakkeet `.col`-elementteinä, välit tekstinä. */
export function lineNodes(line: Line): Node[] {
  return lineParts(line).map((part) => {
    if (!part.column) return document.createTextNode(part.text);
    const col = document.createElement('span');
    col.className = part.column.right ? 'col right' : 'col';
    col.style.setProperty('--col', String(part.text.length));
    col.textContent = part.text;
    return col;
  });
}
