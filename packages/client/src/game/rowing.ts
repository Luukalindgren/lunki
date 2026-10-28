import { stepSwivel, type TubeInput } from '@lunki/shared';

const STILL: TubeInput = { kick: 0, turn: 0, sprint: false };

/**
 * Soutajan kaksi asentoa (#263). Airoissa soutaja soutaa ja kääntää venettä.
 * Vavassa hän kalastaa: vene liukuu omillaan, ja käännös kääntää soutajaa
 * tuhdolla (`look`, kulma veneen suunnasta). Heitto vie vapaan ja soutaminen
 * vieheen ollessa sisällä takaisin airoihin; {oars} vaihtaa asentoa käsin,
 * jotta tuhdolla voi kääntyä tähtäämään jo ennen heittoa.
 */
export class RowerSeat {
  rowing = true;
  look = 0;

  /**
   * Askel. `busy`: viehe on ulkona tai heitto latautuu, jolloin soutaa ei voi.
   * Palauttaa veneen syötteen.
   */
  step(input: TubeInput, busy: boolean, toggle: boolean, dt: number): TubeInput {
    if (busy) this.rowing = false;
    else if (toggle) this.rowing = !this.rowing;
    else if (input.kick !== 0) this.rowing = true;
    this.look = stepSwivel(this.look, input.turn, this.rowing, dt);
    return this.rowing ? input : STILL;
  }

  reset(): void {
    this.rowing = true;
    this.look = 0;
  }
}
