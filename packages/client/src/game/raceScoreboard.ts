import type { CatchRecord, PlayerResult } from '@lunki/shared';
import { formatWeight } from '../i18n';
import type { AlignedLine } from '../ui/columns';

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
): string[] {
  return scoreboardRows(results, myId, rows).map((r) => r.text);
}

/**
 * Tulostaulun rivi ja kenen tulos sillä on (väliviivalla `null`). Nimi ja
 * paino ovat sarakkeita (`ui/columns.ts`), jotta ne ovat kohdakkain myös
 * fontilla, jonka merkit ovat eri levyisiä.
 */
export interface ScoreRow extends AlignedLine {
  id: string | null;
}

/** Tulostaulun rivit tunnisteineen, jotta saaliin saaneen rivi voidaan korostaa (#635). */
export function scoreboardRows(
  results: readonly PlayerResult[],
  myId: string,
  rows = SCOREBOARD_TOP,
): ScoreRow[] {
  const top = results.slice(0, rows);
  const me = results.find((r) => isMine(r, myId));
  const below = me && !top.includes(me) ? me : null;
  // Sijasarake on levein näkyvän sijan levyinen: "10." on merkin pidempi kuin "9." (#739).
  const shown = below ? [...top, below] : top;
  const rankWidth = Math.max(RANK_WIDTH, ...shown.map((r) => rankLabel(r).length));
  // Samoin paino: "12,50 kg" on merkin pidempi kuin "9,50 kg".
  const scoreWidth = Math.max(SCORE_WIDTH, ...shown.map((r) => scoreText(r).length));
  const row = (r: PlayerResult, mine: boolean): ScoreRow => ({
    id: r.id,
    ...scoreLine(r, mine, rankWidth, scoreWidth),
  });
  const lines = top.map((r) => row(r, isMine(r, myId)));
  if (below) lines.push({ id: null, text: '…', columns: [] }, row(below, true));
  return lines;
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
/** Sijan leveys vähintään (merkkiä): "1." tai viiva. */
const RANK_WIDTH = 2;
/** Painon leveys vähintään (merkkiä): "9,50 kg". */
const SCORE_WIDTH = 7;

const scoreText = (r: PlayerResult): string => formatWeight(r.summary.score);

/**
 * Tulostaulun rivi. Ennen ensimmäistä kalaa sija on viiva kuten taukovalikossa
 * (#488, #517): nollien tasapeli ei ole johto. Lähteneen nimen perään tulee
 * lyhyt merkki ×, joka jää näkyviin, vaikka nimi katkeaa. Oman rivin merkki ja
 * sija ovat omat sarakkeensa, ja sija tasataan oikealle: kymmenennestä sijasta
 * alkaen numerot ovat pisteen kohdalta allekkain eikä rivi siirry (#739).
 * Leveydet ovat taulun leveimmän sijan ja painon mukaan.
 */
function scoreLine(
  r: PlayerResult,
  me: boolean,
  rankWidth: number,
  scoreWidth: number,
): AlignedLine {
  const mark = { text: me ? '>' : ' ' };
  const rank = { text: rankLabel(r).padEnd(RANK_WIDTH).padStart(rankWidth), right: true };
  const name = { text: nameField(r) };
  const score = { text: scoreText(r).padStart(scoreWidth), right: true };
  return {
    text: `${mark.text}${rank.text} ${name.text} ${score.text}`,
    columns: [mark, rank, name, score],
  };
}

/**
 * Sija tekstinä: "1." tai saaliittomalle viiva. Sama sääntö kisan taulussa,
 * tulossivulla ja kopioiduissa tuloksissa (#528): nollien tasapeli ei ole sija.
 */
export const rankLabel = (r: PlayerResult): string => (r.summary.count > 0 ? `${r.rank}.` : '–');

function nameField(r: PlayerResult): string {
  // Lähteneen nimessä on tulossivun merkintä "(lähti)": taulussa sen tilalla ×.
  const name = r.left ? r.name.replace(/\s*\([^)]*\)$/, '') : r.name;
  const room = r.left ? NAME_WIDTH - 2 : NAME_WIDTH;
  const short = name.length > room ? `${name.slice(0, room - 1)}…` : name;
  return (r.left ? `${short} ×` : short).padEnd(NAME_WIDTH);
}
