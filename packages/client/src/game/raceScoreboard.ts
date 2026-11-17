import type { CatchRecord, PlayerResult } from '@lunki/shared';
import { formatWeight } from '../i18n';
import type { AlignedLine, Column, Line } from '../ui/columns';
import { resultRowName } from '../ui/resultsText';

/** Kisan aikaisen tulostaulun rivejä kärjestä. */
export const SCOREBOARD_TOP = 5;

/**
 * Kisan aikainen tulostaulu: kärki ja oma rivi, vaikka oma sijoitus olisi
 * tasapisteiden takia kärjen numeroissa mutta listassa sen alapuolella (#276).
 */
export function scoreboardLines(
  results: readonly PlayerResult[],
  myId: string,
  rows = SCOREBOARD_TOP,
  full = false,
): string[] {
  return scoreboardRows(results, myId, rows, full).map((r) => r.text);
}

/**
 * Tulostaulun rivi ja kenen tulos sillä on (väliviivalla `null`). Nimi ja
 * paino ovat sarakkeita (`ui/columns.ts`), jotta ne ovat kohdakkain myös
 * fontilla, jonka merkit ovat eri levyisiä.
 */
export interface ScoreRow extends AlignedLine {
  id: string | null;
  /** Oma rivi (tai lähetysnäkymässä seurattavan): korostetaan keltaisella (#778). */
  mine: boolean;
}

/** Onko taulun rivi oma (#778). Otsikko ja tavallinen teksti eivät ole. */
export const isMineRow = (line: Line): boolean =>
  typeof line !== 'string' && 'mine' in line && line.mine === true;

/**
 * Tulostaulun rivit tunnisteineen, jotta saaliin saaneen rivi voidaan korostaa (#635).
 * Koko taulussa (`full`, Tab pohjassa tai lähetysnäkymä, #743) nimet ovat
 * kokonaan ja rivillä on myös kalojen määrä; otsikkorivi on `scoreboardHead`.
 */
export function scoreboardRows(
  results: readonly PlayerResult[],
  myId: string,
  rows = SCOREBOARD_TOP,
  full = false,
): ScoreRow[] {
  const top = results.slice(0, rows);
  const me = results.find((r) => isMine(r, myId));
  const below = me && !top.includes(me) ? me : null;
  // Sijasarake on levein näkyvän sijan levyinen: "10." on merkin pidempi kuin "9." (#739).
  const shown = below ? [...top, below] : top;
  const rankWidth = Math.max(RANK_WIDTH, ...shown.map((r) => rankLabel(r).length));
  // Samoin paino: "12,50 kg" on merkin pidempi kuin "9,50 kg".
  const scoreWidth = Math.max(SCORE_WIDTH, ...shown.map((r) => scoreText(r).length));
  const layout: Layout = {
    rank: rankWidth,
    score: scoreWidth,
    name: full
      ? Math.min(FULL_NAME_WIDTH, Math.max(NAME_WIDTH, ...shown.map((r) => baseName(r).length)))
      : NAME_WIDTH,
    count: full ? Math.max(COUNT_WIDTH, ...shown.map((r) => String(r.summary.count).length)) : null,
  };
  const row = (r: PlayerResult, mine: boolean): ScoreRow => ({
    id: r.id,
    mine,
    ...scoreLine(r, mine, layout),
  });
  const lines = top.map((r) => row(r, isMine(r, myId)));
  if (below) lines.push({ id: null, mine: false, text: '…', columns: [] }, row(below, true));
  return lines;
}

/**
 * Koko taulu otsikkoriveineen: jokainen kalastaja, nimet kokonaan ja kalojen
 * määrä. Kosketuksella taulu on taukovalikossa eikä HUDissa (#771), ja se on
 * sama taulu kuin työpöydällä Tab pohjassa.
 */
export function fullScoreboard(
  results: readonly PlayerResult[],
  myId: string,
  labels: { title: string; count: string; score: string },
): Line[] {
  const rows = scoreboardRows(results, myId, results.length, true);
  return [scoreboardHead(labels.title, rows, labels), ...rows];
}

/** Saaliin saaneen rivi pysyy korostettuna tämän ajan (s, #635). */
export const CATCH_FLASH_SECONDS = 3;

/**
 * Kuka sai juuri kalan (#635): vertaa tulostaulun saalismääriä edelliseen
 * kertaan ja pitää tuoreimman saaliin esillä hetken. Sama koodi kelpaa
 * moninpeliin, botteihin ja katsojalle, koska se lukee vain tulostaulua.
 * Ensimmäinen kerta vain kirjaa tilanteen (sivun lataus kesken kisan), eikä
 * pelaajan oma saalis korostu: siitä kertoo jo punnitus.
 */
export class CatchFlashes {
  private readonly counts = new Map<string, number>();
  private readonly flashes = new Map<string, { fish: CatchRecord; until: number }>();
  private primed = false;

  /** Korostettavat rivit: tunniste ja tuorein saalis. `now` on kisan kello (s). */
  update(
    results: readonly PlayerResult[],
    myId: string,
    now: number,
  ): ReadonlyMap<string, CatchRecord> {
    for (const r of results) {
      const before = this.counts.get(r.id) ?? 0;
      const count = r.catches.length;
      this.counts.set(r.id, count);
      const fish = r.catches[count - 1];
      if (this.primed && fish && count > before && r.id !== myId)
        this.flashes.set(r.id, { fish, until: now + CATCH_FLASH_SECONDS });
    }
    this.primed = true;
    const live = new Map<string, CatchRecord>();
    for (const [id, f] of this.flashes) {
      // Kello hyppäsi taaksepäin (uusi kisa): vanhat korostukset pois.
      if (now >= f.until || f.until - now > CATCH_FLASH_SECONDS) this.flashes.delete(id);
      else live.set(id, f.fish);
    }
    return live;
  }
}

/** Oma rivi: oma tulos tai oman venekunnan rivi. */
export const isMine = (r: PlayerResult, myId: string) =>
  r.id === myId || (r.members?.some((m) => m.id === myId) ?? false);

/** Nimen leveys tulostaulussa (merkkiä). */
const NAME_WIDTH = 10;
/** Koko taulussa nimen enimmäisleveys, sama kuin tulossivulla (#743). */
const FULL_NAME_WIDTH = 14;
/** Koko taulun kalasarakkeen leveys vähintään: otsikko "kalat" (#743). */
const COUNT_WIDTH = 5;
/** Sijan leveys vähintään (merkkiä): "1." tai viiva. */
const RANK_WIDTH = 2;
/** Painon leveys vähintään (merkkiä): "9,50 kg". */
const SCORE_WIDTH = 7;

const scoreText = (r: PlayerResult): string => formatWeight(r.summary.score);

/** Sarakkeiden leveydet merkkeinä; `count` vain koko taulussa. */
interface Layout {
  rank: number;
  name: number;
  score: number;
  count: number | null;
}

/**
 * Tulostaulun rivi. Ennen ensimmäistä kalaa sija on viiva kuten taukovalikossa
 * (#488, #517): nollien tasapeli ei ole johto. Lähteneen nimen perään tulee
 * lyhyt merkki ×, joka jää näkyviin, vaikka nimi katkeaa. Oman rivin merkki ja
 * sija ovat omat sarakkeensa, ja sija tasataan oikealle: kymmenennestä sijasta
 * alkaen numerot ovat pisteen kohdalta allekkain eikä rivi siirry (#739).
 * Leveydet ovat taulun leveimmän sijan ja painon mukaan.
 */
function scoreLine(r: PlayerResult, me: boolean, layout: Layout): AlignedLine {
  const mark = { text: me ? '>' : ' ' };
  const rank = { text: rankLabel(r).padEnd(RANK_WIDTH).padStart(layout.rank), right: true };
  const name = { text: nameField(r, layout.name) };
  const score = { text: scoreText(r).padStart(layout.score), right: true };
  const count =
    layout.count === null
      ? null
      : { text: String(r.summary.count).padStart(layout.count), right: true };
  const middle = count ? [name, count] : [name];
  return {
    // Kalojen määrän ja painon väliin kaksi välilyöntiä: luvut eivät liimaudu.
    text: `${mark.text}${rank.text} ${middle.map((c) => c.text).join(' ')}${count ? '  ' : ' '}${score.text}`,
    columns: [mark, rank, ...middle, score],
  };
}

/**
 * Koko taulun otsikkorivi (#743): otsikko nimien kohdalla ja sarakkeiden
 * nimet lukujen päällä. Leveydet luetaan taulun ensimmäiseltä riviltä, joten
 * otsikko on aina samoissa sarakkeissa kuin rivit. Pienessä taulussa (ei
 * kalasaraketta) otsikko on pelkkä teksti.
 */
export function scoreboardHead(
  title: string,
  rows: readonly ScoreRow[],
  labels: { count: string; score: string },
): string | AlignedLine {
  const first = rows.find((r) => r.columns.length === 5);
  if (!first) return title;
  const [mark, rank, name, count, score] = first.columns as Column[];
  // Rivillä on välilyönti sijan ja nimen välissä; otsikossa sama välilyönti on
  // nimen perässä, jotta sarakkeet osuvat kohdalleen myös Modernin fontilla.
  const lead = { text: title.padEnd(mark!.text.length + rank!.text.length + name!.text.length) };
  const countHead = { text: labels.count.padStart(count!.text.length), right: true };
  const scoreHead = { text: labels.score.padStart(score!.text.length), right: true };
  return {
    text: `${lead.text}  ${countHead.text}  ${scoreHead.text}`,
    columns: [lead, countHead, scoreHead],
  };
}

/**
 * Sija tekstinä: "1." tai saaliittomalle viiva. Sama sääntö kisan taulussa,
 * tulossivulla ja kopioiduissa tuloksissa (#528): nollien tasapeli ei ole sija.
 */
export const rankLabel = (r: PlayerResult): string => (r.summary.count > 0 ? `${r.rank}.` : '–');

/**
 * Nimi ilman tulossivun merkintöjä "(lähti)" ja "(botti)" (`resultRowName`):
 * taulussa lähteneen merkki on ×, ja botin tunnistaa nimestä.
 */
const plainName = (r: PlayerResult): string => resultRowName(r).name;
const baseName = (r: PlayerResult): string => (r.left ? `${plainName(r)} ×` : plainName(r));

function nameField(r: PlayerResult, width: number): string {
  const name = plainName(r);
  const room = r.left ? width - 2 : width;
  const short = name.length > room ? `${name.slice(0, room - 1)}…` : name;
  return (r.left ? `${short} ×` : short).padEnd(width);
}
