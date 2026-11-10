import type { Vec2 } from '@lunki/shared';

/** Järven linnut (#571, #572) piirtoa varten. */
export type BirdKind = 'drake' | 'hen' | 'duckling' | 'swan' | 'loon' | 'gull' | 'tern' | 'osprey';

/** Yksi lintu tällä hetkellä. */
export interface BirdPose {
  kind: BirdKind;
  pos: Vec2;
  /** Korkeus pinnasta (m), uidessa 0. */
  height: number;
  /** Kulkusuunta (rad, 0 = itä, pohjoinen positiivinen). */
  heading: number;
  flying: boolean;
  /** Siipien lyönnin vaihe 0–1. */
  flap: number;
  /** Kalasääski nousee kala kynsissä. */
  carrying?: boolean;
}

/** Lintujen tapahtuma: ääni ja rengas veteen. */
export interface BirdEvent {
  kind: 'flush' | 'land' | 'dive' | 'surface' | 'cry' | 'catch';
  pos: Vec2;
  bird: 'mallard' | 'swan' | 'loon' | 'gull' | 'tern' | 'osprey';
}
