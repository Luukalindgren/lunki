import {
  DIFFICULTY_NAMES,
  NAME_MAX_LENGTH,
  PENALTY_OPTIONS,
  PLAYER_COUNTS,
  SPECIES_OPTIONS,
  WEATHER_OPTIONS,
  WIN_RULE_NAMES,
  formatRoomCode,
  DURATIONS,
  formatTime,
  formatWeight,
  summarize,
  type CompetitionSettings,
  type CompetitionState,
  type Difficulty,
  type PlayerResult,
  type RoomSettings,
  type WinRule,
} from '@lunki/shared';
import type { LobbyView } from '../net/session';

const SETTINGS_KEY = 'lunki.soloSettings';

export function loadSettings(defaults: CompetitionSettings): CompetitionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<CompetitionSettings>) };
  } catch {
    // Selaimen muisti ei käytössä: oletukset kelpaavat.
  }
  return { ...defaults };
}

function saveSettings(s: CompetitionSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ei haittaa
  }
}

/** Valikot ja ruudut (aloitus, tauko, tulokset) HUD:n päällä. */
export class Screens {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  showStart(
    initial: CompetitionSettings,
    onStart: (s: CompetitionSettings) => void,
    onMultiplayer: () => void,
  ): void {
    const settings = { ...initial };
    const panel = this.panel();
    panel.append(
      h('h1', 'LUNKI'),
      h('p', 'Kelluntarengaskalastusta Tammelan Lunkinjärvellä', 'subtitle'),
      this.choice(
        'Kilpailuaika',
        DURATIONS.map((d) => [String(d), `${d} min`]),
        String(settings.durationMinutes),
        (v) => (settings.durationMinutes = Number(v)),
      ),
      this.choice(
        'Kalastuksen vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        settings.difficulty,
        (v) => (settings.difficulty = v as Difficulty),
      ),
      h(
        'p',
        'Helppo: kala tarttuu aina ja tulee ylös kelaamalla. Realistinen: vastaisku, jarru ja siiman kireys ratkaisevat.',
        'hint',
      ),
      this.buttons([
        [
          'Aloita kisa',
          () => {
            saveSettings(settings);
            onStart(settings);
          },
        ],
        ['Moninpeli', onMultiplayer],
      ]),
      h(
        'p',
        'W/S potki · A/D käänny · hiiri tähtää ja heittää · kelaa hiirellä tai välilyönnillä · Q/E jarru · Esc tauko',
        'hint',
      ),
    );
    this.show(panel);
  }

  /** Moninpelin aloitus: nimimerkki, uusi huone tai liittyminen koodilla. */
  showMultiplayer(
    name: string,
    code: string,
    onCreate: (name: string) => void,
    onJoin: (name: string, code: string) => void,
    onBack: () => void,
    error?: string,
  ): void {
    const panel = this.panel();
    const nameInput = this.input('Nimimerkki', name, NAME_MAX_LENGTH, 'Kalastaja');
    const codeInput = this.input('Huonekoodi', code, 40, 'LUNKI-XXXX');
    const nameValue = () => (nameInput.querySelector('input') as HTMLInputElement).value;
    const codeValue = () => (codeInput.querySelector('input') as HTMLInputElement).value;
    const status = h('p', 'Tarkistetaan palvelinta…', 'hint server-status');
    panel.append(h('h2', 'Moninpeli'), status, nameInput);
    if (error) panel.append(h('p', error, 'error'));
    panel.append(
      this.buttons([['Luo uusi huone', () => onCreate(nameValue())]]),
      codeInput,
      this.buttons([
        ['Liity koodilla', () => onJoin(nameValue(), codeValue())],
        ['Takaisin', onBack],
      ]),
      h('p', 'Luo huone ja lähetä koodi tai linkki kavereille. Kirjautumista ei tarvita.', 'hint'),
    );
    codeInput.querySelector('input')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onJoin(nameValue(), codeValue());
    });
    this.show(panel);
    if (code) codeInput.querySelector('input')!.focus();
    else nameInput.querySelector('input')!.select();
  }

  /** Moninpelivalikon palvelinrivi. */
  setServerStatus(ok: boolean): void {
    const el = this.root.querySelector<HTMLElement>('.server-status');
    if (!el) return;
    el.textContent = ok
      ? 'Palvelin päällä'
      : 'Palvelimeen ei saada yhteyttä. Yksinpeli toimii silti; moninpeliin tarvitaan palvelin päälle.';
    el.classList.toggle('error', !ok);
    el.classList.toggle('ok', ok);
  }

  showMessage(title: string, text: string, onCancel?: () => void): void {
    const panel = this.panel();
    panel.append(h('h2', title), h('p', text));
    if (onCancel) panel.append(this.buttons([['Peruuta', onCancel]]));
    this.show(panel);
  }

  /** Aula: pelaajat, valmius ja kisan aloitus. Piirretään uudelleen tilan muuttuessa. */
  showLobby(
    v: LobbyView,
    link: string,
    actions: {
      onReady: (ready: boolean) => void;
      onStart: () => void;
      onLeave: () => void;
      onSettings: (patch: Partial<RoomSettings>) => void;
    },
    notice?: string,
  ): void {
    const panel = this.panel();
    const me = v.players.find((p) => p.me);
    const code = h('p', formatRoomCode(v.code), 'room-code');
    const copy = document.createElement('button');
    copy.textContent = 'Kopioi kutsulinkki';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(link).then(
        () => (copy.textContent = 'Linkki kopioitu!'),
        () => (copy.textContent = link),
      );
    });
    const list = document.createElement('ul');
    list.className = 'player-list';
    for (const p of v.players) {
      const li = document.createElement('li');
      const state = !p.connected
        ? 'yhteys poikki'
        : p.host
          ? 'luoja'
          : p.ready
            ? 'valmis'
            : 'odottaa';
      li.textContent = `${p.name}${p.me ? ' (sinä)' : ''}`;
      li.append(h('span', state, `player-state ${p.host || p.ready ? 'ok' : ''}`));
      list.appendChild(li);
    }
    panel.append(
      h('h2', 'Aula'),
      h('p', 'Huonekoodi', 'hint'),
      code,
      copy,
      h('p', `Pelaajat ${v.players.length}/${v.maxPlayers}`, 'choice-label'),
      list,
      v.amHost
        ? this.settingsEditor(v.settings, v.players.length, actions.onSettings)
        : this.settingsSummary(v.settings),
    );
    if (notice) panel.append(h('p', notice, 'error'));
    const buttons: [string, () => void][] = [];
    if (v.amHost)
      buttons.push([v.allReady ? 'Aloita kisa' : 'Aloita (odotetaan muita)', actions.onStart]);
    else
      buttons.push([
        me?.ready ? 'En olekaan valmis' : 'Valmis!',
        () => actions.onReady(!me?.ready),
      ]);
    buttons.push(['Poistu', actions.onLeave]);
    panel.append(this.buttons(buttons));
    this.show(panel);
  }

  showPause(onResume: () => void, onQuit: () => void, multiplayer = false): void {
    const panel = this.panel();
    panel.append(
      h('h2', multiplayer ? 'Valikko' : 'Tauko'),
      ...(multiplayer ? [h('p', 'Kisa jatkuu muilla taustalla.', 'hint')] : []),
      this.buttons([
        ['Jatka', onResume],
        [multiplayer ? 'Poistu kisasta' : 'Lopeta kisa', onQuit],
      ]),
    );
    this.show(panel);
  }

  /** Moninpelin lopputulokset voittoehdon mukaan. */
  showRaceResults(
    results: PlayerResult[],
    settings: RoomSettings,
    myId: string,
    amHost: boolean,
    onRestart: () => void,
    onLeave: () => void,
  ): void {
    const panel = this.panel();
    const winner = results[0];
    panel.append(
      h('h2', 'Kisa päättyi!'),
      h(
        'p',
        winner && winner.summary.score > 0
          ? `Voittaja: ${winner.name} (${formatWeight(winner.summary.score)})`
          : 'Kukaan ei saanut kalaa.',
        'total',
      ),
    );
    const table = document.createElement('ol');
    table.className = 'catch-list results';
    for (const r of results) {
      const li = document.createElement('li');
      li.value = r.rank;
      li.classList.toggle('me', r.id === myId);
      const biggest = r.summary.biggest ? formatWeight(r.summary.biggest.weight) : '–';
      li.textContent = `${r.name.padEnd(12)} ${String(r.summary.count).padStart(2)} kpl  ${formatWeight(r.summary.total).padStart(8)}  suurin ${biggest}`;
      table.appendChild(li);
    }
    panel.append(
      table,
      h(
        'p',
        `${WIN_RULE_NAMES[settings.winRule]} · ${DIFFICULTY_NAMES[settings.difficulty]} · ${settings.durationMinutes} min`,
        'hint',
      ),
      this.buttons(
        amHost
          ? [
              ['Uusi kisa samalla porukalla', onRestart],
              ['Poistu', onLeave],
            ]
          : [['Poistu', onLeave]],
      ),
    );
    if (!amHost) panel.append(h('p', 'Huoneen luoja voi aloittaa uuden kisan.', 'hint'));
    this.show(panel);
  }

  showResults(c: CompetitionState, onAgain: () => void, onMenu: () => void): void {
    const panel = this.panel();
    const sum = summarize(c.catches, c.settings.winRule);
    panel.append(
      h('h2', c.elapsed >= c.settings.durationMinutes * 60 ? 'Aika loppui!' : 'Kisa päättyi'),
    );
    if (sum.count === 0) {
      panel.append(
        h('p', 'Ei saalista tällä kertaa. Kokeile rantojen tuntumaa ja hitaampaa kelausta.'),
      );
    } else {
      const list = document.createElement('ol');
      list.className = 'catch-list';
      for (const ct of [...c.catches].sort((a, b) => b.weight - a.weight)) {
        const li = document.createElement('li');
        li.textContent = `${ct.name.padEnd(8)} ${formatWeight(ct.weight).padStart(8)}   ${formatTime(ct.time)}`;
        list.appendChild(li);
      }
      panel.append(
        list,
        h(
          'p',
          `Kaloja ${sum.count} · yhteensä ${formatWeight(sum.total)} · suurin ${formatWeight(sum.biggest!.weight)}`,
          'total',
        ),
      );
    }
    panel.append(
      h(
        'p',
        `${DIFFICULTY_NAMES[c.settings.difficulty]} · ${c.settings.durationMinutes} min`,
        'hint',
      ),
      this.buttons([
        ['Uusi kisa', onAgain],
        ['Valikkoon', onMenu],
      ]),
    );
    this.show(panel);
  }

  private panel(): HTMLDivElement {
    const p = document.createElement('div');
    p.className = 'screen-panel';
    return p;
  }

  private show(panel: HTMLElement): void {
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    panel.querySelector<HTMLButtonElement>('button.primary')?.focus();
  }

  private choice(
    label: string,
    options: [string, string, boolean?][],
    selected: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', label, 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const [value, text, disabled] of options) {
      const b = document.createElement('button');
      b.textContent = text;
      b.disabled = disabled === true;
      b.classList.toggle('selected', value === selected);
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        onChange(value);
      });
      group.appendChild(b);
    }
    row.append(group);
    return row;
  }

  /** Isännän asetusvalinnat aulassa. */
  private settingsEditor(
    s: RoomSettings,
    playerCount: number,
    change: (patch: Partial<RoomSettings>) => void,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings';
    box.append(
      this.choice(
        'Kilpailuaika',
        DURATIONS.map((d) => [String(d), `${d} min`]),
        String(s.durationMinutes),
        (v) => change({ durationMinutes: Number(v) }),
      ),
      this.choice(
        'Voittaja',
        (Object.keys(WIN_RULE_NAMES) as WinRule[]).map((w) => [w, WIN_RULE_NAMES[w]]),
        s.winRule,
        (v) => change({ winRule: v as WinRule }),
      ),
      this.choice(
        'Kalastuksen vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        s.difficulty,
        (v) => change({ difficulty: v as Difficulty }),
      ),
      this.choice(
        'Pelaajia enintään',
        PLAYER_COUNTS.map((n) => [String(n), String(n), n < playerCount]),
        String(s.maxPlayers),
        (v) => change({ maxPlayers: Number(v) }),
      ),
      h('p', 'Tulossa myöhemmin:', 'hint'),
      this.choice(
        'Sää',
        WEATHER_OPTIONS.map((o) => [o.value, o.label, !o.ready]),
        s.weather,
        () => undefined,
      ),
      this.choice(
        'Salama',
        PENALTY_OPTIONS.map((o) => [o.value, o.label, !o.ready]),
        s.lightningPenalty,
        () => undefined,
      ),
      this.choice(
        'Kaatuminen',
        PENALTY_OPTIONS.map((o) => [o.value, o.label, !o.ready]),
        s.capsizePenalty,
        () => undefined,
      ),
      this.choice(
        'Kalalajit',
        SPECIES_OPTIONS.map((o) => [o.value, o.label, !o.ready]),
        s.species[0] ?? 'perch',
        () => undefined,
      ),
    );
    return box;
  }

  /** Muut pelaajat näkevät asetukset tekstinä. */
  private settingsSummary(s: RoomSettings): HTMLElement {
    const label = <T>(list: { value: T; label: string }[], v: T) =>
      list.find((o) => o.value === v)?.label ?? String(v);
    const box = document.createElement('div');
    box.className = 'settings-summary';
    const rows: [string, string][] = [
      ['Kilpailuaika', `${s.durationMinutes} min`],
      ['Voittaja', WIN_RULE_NAMES[s.winRule]],
      ['Vaikeus', DIFFICULTY_NAMES[s.difficulty]],
      ['Pelaajia enintään', String(s.maxPlayers)],
      ['Sää', label(WEATHER_OPTIONS, s.weather)],
      [
        'Salama / kaatuminen',
        `${label(PENALTY_OPTIONS, s.lightningPenalty)} / ${label(PENALTY_OPTIONS, s.capsizePenalty)}`,
      ],
      ['Kalalajit', s.species.map((v) => label(SPECIES_OPTIONS, v)).join(', ')],
    ];
    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.append(h('span', k, 'choice-label'), h('span', v));
      box.append(row);
    }
    return box;
  }

  private input(label: string, value: string, maxLength: number, placeholder: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'choice';
    row.append(h('span', label, 'choice-label'));
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    row.append(input);
    return row;
  }

  private buttons(list: [string, () => void][]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'buttons';
    list.forEach(([text, action], i) => {
      const b = document.createElement('button');
      b.textContent = text;
      if (i === 0) b.classList.add('primary');
      b.addEventListener('click', action);
      row.appendChild(b);
    });
    return row;
  }
}

function h(tag: string, text: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}
