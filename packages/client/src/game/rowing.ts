import { stepSwivel, type TubeInput } from '@lunki/shared';

const STILL: TubeInput = { kick: 0, turn: 0, sprint: false };

/**
 * Soutajan kaksi asentoa (#263). Airoissa soutaja soutaa ja kääntää venettä,
 * myös vieheen ollessa vedessä (soutu-uistelu: viehe kulkee perässä). Vavassa
 * hän heittää ja kelaa: vene liukuu omillaan, ja käännös kääntää soutajaa
 * tuhdolla (`look`, kulma veneen suunnasta). Heitto ja kelaus vievät vapaan,
 * soutaminen takaisin airoihin; {oars} vaihtaa asentoa käsin, jotta tuhdolla
 * voi kääntyä tähtäämään jo ennen heittoa.
 */
export class RowerSeat {
  rowing = true;
  look = 0;

  /**
   * Askel. `rod`: heitto latautuu, viehe lentää tai soutaja kelaa, jolloin
   * kädet ovat vavassa eikä soutaa voi. Palauttaa veneen syötteen.
   */
  step(input: TubeInput, rod: boolean, toggle: boolean, dt: number): TubeInput {
    if (rod) this.rowing = false;
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
