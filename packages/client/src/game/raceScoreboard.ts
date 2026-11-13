import type { CatchRecord, PlayerResult } from '@lunki/shared';
import { formatWeight } from '../i18n';

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

/** Tulostaulun rivi ja kenen tulos sillä on (väliviivalla `null`). */
export interface ScoreRow {
  id: string | null;
  text: string;
}

/** Tulostaulun rivit tunnisteineen, jotta saaliin saaneen rivi voidaan korostaa (#635). */
export function scoreboardRows(
  results: readonly PlayerResult[],
  myId: string,
  rows = SCOREBOARD_TOP,
): ScoreRow[] {
  const top = results.slice(0, rows);
  const row = (r: PlayerResult, me: boolean): ScoreRow => ({ id: r.id, text: scoreLine(r, me) });
  const lines = top.map((r) => row(r, isMine(r, myId)));
  const me = results.find((r) => isMine(r, myId));
  if (me && !top.includes(me)) lines.push({ id: null, text: '…' }, row(me, true));
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

/**
 * Tulostaulun rivi. Ennen ensimmäistä kalaa sija on viiva kuten taukovalikossa
 * (#488, #517): nollien tasapeli ei ole johto. Lähteneen nimen perään tulee
 * lyhyt merkki ×, joka jää näkyviin, vaikka nimi katkeaa.
 */
function scoreLine(r: PlayerResult, me: boolean): string {
  return `${me ? '>' : ' '}${rankLabel(r).padEnd(2)} ${nameField(r)} ${formatWeight(r.summary.score).padStart(7)}`;
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
