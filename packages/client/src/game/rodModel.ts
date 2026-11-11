/**
 * Vavan ja kelan värit paletista. Samat värit piirtävät vavan kalastajan
 * silmin (`povRod.ts`) ja kalastajan mallin kädessä (`tubeMesh.ts`), joten
 * oma ja muiden pelaajien vapa näyttävät samalta.
 */
export const ROD_COLOR = {
  rod: 0xf6d04d,
  rodShade: 0x8a6a42,
  cork: 0xb99a68,
  corkShade: 0x5e432b,
  seat: 0x1c232b,
  body: 0x39424d,
  dark: 0x1c232b,
  rotor: 0x5f6b78,
  light: 0xc3cbd2,
  knob: 0xe0cf9c,
  /** Perhovapa (#236): oliivinvihreä aihio. */
  flyRod: 0x6a9a3e,
} as const;
