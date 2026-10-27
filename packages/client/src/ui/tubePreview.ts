import type { Appearance } from '@lunki/shared';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * Pieni pikselikuva omasta renkaasta ylhäältä, katse ylöspäin: räpylät
 * edessä, U-muotoinen rengas, hartiat ja siima vavan kärjestä veteen. Canvas on 40×40;
 * CSS suurentaa sen terävänä.
 */
export function drawTubePreview(canvas: HTMLCanvasElement, a: Appearance): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const fill = (hex: number, x: number, y: number, w: number, h: number) => {
    g.fillStyle = css(hex);
    g.fillRect(x, y, w, h);
  };
  fill(0x1b5a84, 0, 0, 40, 40);

  // Siima löysänä mutkana vavan kärjestä ylös oikealle.
  g.fillStyle = css(a.line);
  for (let y = 0; y < 12; y++) g.fillRect(29 + Math.round(Math.sin(y * 0.7) * 2), y, 1, 1);

  // Lyhyet sääret ja räpylät renkaan avoimen etupään edessä.
  fill(0x3b4630, 15, 8, 3, 6);
  fill(0x3b4630, 22, 8, 3, 6);
  fill(a.fins, 14, 3, 5, 6);
  fill(a.fins, 21, 3, 5, 6);

  // U-muotoinen rengas: kaari takana ja sivuponttoonit, joiden kärjet
  // jatkuvat siimatason ohi eteen.
  g.fillStyle = css(a.tube);
  g.beginPath();
  g.arc(20, 24, 12, 0, Math.PI);
  g.arc(20, 24, 6, Math.PI, 0, true);
  g.fill();
  fill(a.tube, 8, 12, 6, 12);
  fill(a.tube, 26, 12, 6, 12);
  for (const x of [11, 29]) {
    g.beginPath();
    g.arc(x, 12, 3, 0, Math.PI * 2);
    g.fill();
  }

  // Himmeä siimataso reisien päällä ponttoonien välissä.
  fill(0x1c232b, 14, 13, 12, 6);
  for (let y = 14; y < 18; y += 2) for (let x = 15; x < 25; x += 2) fill(0x3a4652, x, y, 1, 1);

  fill(0x3b4630, 14, 19, 12, 3); // reidet

  // Hartiat, pää ja lippalakki; vapa oikealta kädeltä eteen.
  fill(a.shirt, 13, 22, 14, 5);
  fill(0xe0cf9c, 18, 20, 4, 4);
  fill(0xf6d04d, 18, 18, 4, 2);
  fill(0xf6d04d, 27, 12, 2, 12);
  fill(0xf6d04d, 28, 11, 1, 2);
}
