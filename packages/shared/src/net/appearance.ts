/**
 * Pelaajan ulkonäkö: renkaan, räpylöiden, paidan ja siiman väri. Värit ovat
 * pelin paletista, koska jälkikäsittely pyöristää kaiken paletin sävyihin.
 */
export interface Appearance {
  tube: number;
  fins: number;
  shirt: number;
  line: number;
}

export type AppearancePart = keyof Appearance;

export interface ColorOption {
  hex: number;
  name: string;
}

/** Renkaan, räpylöiden ja paidan värit. */
export const GEAR_COLORS: readonly ColorOption[] = [
  { hex: 0xd23a2a, name: 'Punainen' },
  { hex: 0x8c1c1c, name: 'Viininpunainen' },
  { hex: 0xf08a2c, name: 'Oranssi' },
  { hex: 0xf6d04d, name: 'Keltainen' },
  { hex: 0xa3c45a, name: 'Limenvihreä' },
  { hex: 0x3b7337, name: 'Vihreä' },
  { hex: 0x24502c, name: 'Metsänvihreä' },
  { hex: 0x2f9e8f, name: 'Turkoosi' },
  { hex: 0x4d9cc2, name: 'Vaaleansininen' },
  { hex: 0x1b5a84, name: 'Sininen' },
  { hex: 0x6b2d6e, name: 'Violetti' },
  { hex: 0xc05bb4, name: 'Pinkki' },
  { hex: 0x5e432b, name: 'Ruskea' },
  { hex: 0x5f6b78, name: 'Harmaa' },
  { hex: 0x1c232b, name: 'Musta' },
  { hex: 0xeef2f3, name: 'Valkoinen' },
];

/** Siiman värit: kirkkaat erottuvat vedestä parhaiten. */
export const LINE_COLORS: readonly ColorOption[] = [
  { hex: 0xc3cbd2, name: 'Kirkas' },
  { hex: 0xeef2f3, name: 'Valkoinen' },
  { hex: 0xfff3b0, name: 'Keltainen' },
  { hex: 0x9ef0d6, name: 'Fluorivihreä' },
  { hex: 0xf08a2c, name: 'Oranssi' },
  { hex: 0xd23a2a, name: 'Punainen' },
  { hex: 0xc05bb4, name: 'Pinkki' },
  { hex: 0x1c232b, name: 'Musta' },
];

export const colorOptions = (part: AppearancePart): readonly ColorOption[] =>
  part === 'line' ? LINE_COLORS : GEAR_COLORS;

export const APPEARANCE_PARTS: readonly AppearancePart[] = ['tube', 'fins', 'shirt', 'line'];

export const DEFAULT_APPEARANCE: Appearance = {
  tube: 0xd23a2a,
  fins: 0x1c232b,
  shirt: 0x24502c,
  line: 0xc3cbd2,
};

const allowed = (part: AppearancePart, v: unknown): v is number =>
  typeof v === 'number' && colorOptions(part).some((c) => c.hex === v);

/** Tarkistaa ulkonäön; tuntemattomat värit korvautuvat oletuksilla. Null, jos ei olio. */
export function parseAppearance(v: unknown): Appearance | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out = { ...DEFAULT_APPEARANCE };
  for (const part of APPEARANCE_PARTS) if (allowed(part, o[part])) out[part] = o[part];
  return out;
}

/** Ensikertalaiselle arvottu ulkonäkö, jotta pelaajat erottuvat toisistaan. */
export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (list: readonly ColorOption[]) =>
    list[Math.floor(random() * list.length) % list.length]!.hex;
  // Renkaaksi kirkas väri: tummat ja siniset hukkuvat veteen.
  const bright = GEAR_COLORS.filter((c) =>
    [0xd23a2a, 0xf08a2c, 0xf6d04d, 0xa3c45a, 0x2f9e8f, 0xc05bb4, 0xeef2f3].includes(c.hex),
  );
  return { ...DEFAULT_APPEARANCE, tube: pick(bright), shirt: pick(GEAR_COLORS) };
}
