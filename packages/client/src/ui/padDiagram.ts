import type { PadKind } from '../engine/gamepad';
import { bindingText, padButtonName, type Action } from '../game/controls';
import { t, type MsgKey } from '../i18n';

/**
 * Ohjainkuva Ohjeisiin (#594): kuva ohjaimesta nappien nimillä ja luettelo,
 * mitä kukin tekee. Nappien nimet ja luettelon napit tulevat
 * `CONTROLS`-kartasta, joten kartan muutos päivittää kuvan.
 */
const ROWS: readonly (readonly [Action | 'leftStick' | 'rightStick', MsgKey])[] = [
  ['castForward', 'padmap.main'],
  ['twitch', 'padmap.twitch'],
  ['cancel', 'padmap.cancel'],
  ['view', 'padmap.view'],
  ['leftStick', 'padmap.move'],
  ['rightStick', 'padmap.look'],
  ['sprint', 'padmap.sprint'],
  ['lure', 'padmap.lure'],
  ['method', 'padmap.method'],
  ['dragMore', 'padmap.dragMore'],
  ['dragLess', 'padmap.dragLess'],
  ['gearNext', 'padmap.gear'],
  ['cut', 'padmap.cut'],
  ['anchor', 'padmap.anchor'],
  ['sonar', 'padmap.sonar'],
  ['emote', 'padmap.emote'],
  ['pause', 'padmap.pause'],
  ['zoom', 'padmap.zoom'],
  ['camera', 'padmap.camera'],
  ['help', 'padmap.help'],
];

/** Luettelon rivit: napin nimi ohjaimen merkinnöin ja toiminnon kuvaus. */
export function padMapRows(): { button: string; text: string }[] {
  return ROWS.flatMap(([action, label]) => {
    // Tatit nimetään kokonaisina: suunnat kertoo kuvaus.
    const button =
      action === 'leftStick' || action === 'rightStick'
        ? t(`pad.${action}`)
        : bindingText(action, 'pad');
    return button ? [{ button, text: t(label) }] : [];
  });
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Nappien paikat kuvassa. Xboxissa vasen tatti on ylhäällä ja ristiohjain
 * alhaalla, PlayStationissa toisin päin.
 */
function layout(kind: PadKind) {
  const xbox = kind === 'xbox';
  return {
    leftStick: xbox ? { x: 78, y: 78 } : { x: 116, y: 118 },
    dpad: xbox ? { x: 116, y: 118 } : { x: 78, y: 78 },
    rightStick: { x: 204, y: 118 },
    face: { x: 242, y: 78 },
  };
}

/** Kuva ohjaimesta: napit nimettyinä Xbox- tai PlayStation-merkinnöin. */
export function padDiagram(kind: PadKind): HTMLElement {
  const name = (code: string) => padButtonName(code, kind);
  const at = layout(kind);
  const root = svg('svg', {
    viewBox: '0 0 320 176',
    class: 'pad-diagram',
    role: 'img',
    'aria-label': t('padmap.title'),
  });
  const label = (x: number, y: number, text: string, cls = 'pad-text') =>
    svg(
      'text',
      { x, y, class: cls, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
      text,
    );
  const button = (x: number, y: number, w: number, text: string) => [
    svg('rect', { x: x - w / 2, y: y - 9, width: w, height: 18, class: 'pad-button' }),
    label(x, y, text),
  ];
  const round = (x: number, y: number, r: number, text: string, cls = 'pad-button') => [
    svg('circle', { cx: x, cy: y, r, class: cls }),
    label(x, y, text),
  ];
  root.append(
    // Liipaisimet ja olkanapit rungon yläpuolella.
    ...button(78, 12, 44, name('Pad6')),
    ...button(242, 12, 44, name('Pad7')),
    ...button(78, 34, 44, name('Pad4')),
    ...button(242, 34, 44, name('Pad5')),
    svg('path', {
      class: 'pad-body',
      d: 'M56 48 H264 L290 70 L304 150 L282 168 L250 168 L222 140 H98 L70 168 L38 168 L16 150 L30 70 Z',
    }),
    ...round(at.leftStick.x, at.leftStick.y, 15, name('Pad10'), 'pad-stick'),
    ...round(at.rightStick.x, at.rightStick.y, 15, name('Pad11'), 'pad-stick'),
    // Ristiohjain.
    svg('path', {
      class: 'pad-button',
      d: `M${at.dpad.x - 6} ${at.dpad.y - 18} h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 v-12 h12 Z`,
    }),
    label(at.dpad.x, at.dpad.y, '✚'),
    // Neljä nappia: Y/△ ylhäällä, A/✕ alhaalla, X/□ vasemmalla, B/○ oikealla.
    ...round(at.face.x, at.face.y - 17, 9, name('Pad3')),
    ...round(at.face.x, at.face.y + 17, 9, name('Pad0')),
    ...round(at.face.x - 17, at.face.y, 9, name('Pad2')),
    ...round(at.face.x + 17, at.face.y, 9, name('Pad1')),
    ...button(134, 64, 46, name('Pad8')),
    ...button(186, 64, 46, name('Pad9')),
  );
  const box = document.createElement('div');
  box.className = 'pad-map';
  const list = document.createElement('dl');
  list.className = 'pad-map-list';
  for (const row of padMapRows()) {
    const dt = document.createElement('dt');
    dt.textContent = row.button;
    const dd = document.createElement('dd');
    dd.textContent = row.text;
    list.append(dt, dd);
  }
  box.append(root, list);
  return box;
}
