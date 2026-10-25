import {
  DIFFICULTY_NAMES,
  LINES,
  LINE_IDS,
  LURES,
  LURE_IDS,
  RODS,
  ROD_IDS,
  DEFAULT_TACKLE,
  describeFullTackle,
  NAME_MAX_LENGTH,
  CAPSIZE_PENALTY_OPTIONS,
  LIGHTNING_PENALTY_OPTIONS,
  isPenalty,
  type Penalty,
  PLAYER_COUNTS,
  SPECIES_OPTIONS,
  WEATHER_OPTIONS,
  WIN_RULE_NAMES,
  formatRoomCode,
  DURATIONS,
  formatTime,
  formatWeight,
  isSpeciesId,
  isWeatherLevel,
  summarize,
  type CompetitionSettings,
  type CompetitionState,
  type Difficulty,
  type PlayerResult,
  type RoomSettings,
  type SpeciesId,
  type Tackle,
  FEEDBACK_LIMITS,
  mapCredits,
  type RecordBoard,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import type { LobbyView } from '../net/session';
import { LIBRARIES } from './credits';
import { VOLUME_LEVELS, type AudioSettings, type VolumeLevel } from '../audio/settings';

const SETTINGS_KEY = 'lunki.soloSettings';

export function loadSettings(defaults: CompetitionSettings): CompetitionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = { ...defaults, ...(JSON.parse(raw) as Partial<CompetitionSettings>) };
      const species = Array.isArray(s.species) ? s.species.filter(isSpeciesId) : [];
      return {
        ...s,
        species: species.length > 0 ? species : defaults.species,
        weather: isWeatherLevel(s.weather) ? s.weather : defaults.weather,
        lightningPenalty: isPenalty(s.lightningPenalty)
          ? s.lightningPenalty
          : defaults.lightningPenalty,
        capsizePenalty: isPenalty(s.capsizePenalty) ? s.capsizePenalty : defaults.capsizePenalty,
      };
    }
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

  /** Päävalikko: pelimuodot ja muut näkymät allekkain. */
  showStart(actions: {
    onSolo: () => void;
    onMultiplayer: () => void;
    onRecords: () => void;
    onAudio: () => void;
    onFeedback: () => void;
    onCredits: () => void;
  }): void {
    const panel = this.panel();
    const menu = this.buttons([
      ['Yksinpeli', actions.onSolo],
      ['Moninpeli', actions.onMultiplayer],
      ['Ennätykset', actions.onRecords],
      ['Äänet', actions.onAudio],
      ['Palaute', actions.onFeedback],
      ['Tekijät ja lähteet', actions.onCredits],
    ]);
    menu.classList.add('main-menu');
    panel.append(
      h('h1', 'LUNKI'),
      h('p', 'Kelluntarengaskalastusta Tammelan Lunkinjärvellä', 'subtitle'),
      ...(touchOnly() ? [h('p', NEEDS_KEYBOARD, 'error')] : []),
      menu,
      h(
        'p',
        'W/S potki · A/D käänny · hiiri tähtää ja heittää · kelaa hiirellä tai välilyönnillä · Q/E jarru · Esc tauko',
        'hint',
      ),
      h('p', 'Kartta © OpenStreetMapin tekijät, Copernicus DEM, Syke', 'hint credit-line'),
    );
    this.show(panel);
  }

  /** Yksinpelin asetukset ennen kisaa. */
  showSoloSetup(
    initial: CompetitionSettings,
    onStart: (s: CompetitionSettings) => void,
    onBack: () => void,
  ): void {
    const settings = { ...initial };
    const panel = this.panel();
    panel.append(
      h('h2', 'Yksinpeli'),
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
      this.speciesChoice(settings.species ?? [], (list) => (settings.species = list)),
      this.choice(
        'Sää',
        WEATHER_OPTIONS.map((o) => [o.value, o.label]),
        settings.weather ?? 'realistic',
        (v) => (settings.weather = v as WeatherLevel),
      ),
      this.choice(
        'Salama',
        LIGHTNING_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        settings.lightningPenalty ?? 'time-out',
        (v) => (settings.lightningPenalty = v as Penalty),
      ),
      this.choice(
        'Kaatuminen',
        CAPSIZE_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        settings.capsizePenalty ?? 'none',
        (v) => (settings.capsizePenalty = v as Penalty),
      ),
      h(
        'p',
        'Ukkosella salama voi iskeä, jos vapa on ylhäällä: kelaa viehe sisään. Iso aalto kaataa renkaan sivulta: käänny aaltoa kohti.',
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
        ['Takaisin', onBack],
      ]),
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
    panel.append(h('h2', 'Moninpeli'));
    if (touchOnly()) {
      const where = code ? ` Kirjoita siellä koodi ${code}.` : '';
      panel.append(h('p', NEEDS_KEYBOARD + where, 'error'));
    }
    panel.append(status, nameInput);
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
      onTackle: (t: Tackle) => void;
    },
    notice?: string,
  ): void {
    const panel = this.panel();
    panel.dataset.screen = 'lobby';
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
      li.append(
        h('span', state, `player-state ${p.host || p.ready ? 'ok' : ''}`),
        h('span', describeFullTackle(p.tackle), 'player-gear'),
      );
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
      h('p', 'Omat varusteet', 'choice-label'),
      this.tackleEditor(me?.tackle ?? DEFAULT_TACKLE, actions.onTackle),
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

  /** Testaajan palaute: teksti lähetetään pelipalvelimelle. */
  showFeedback(
    name: string,
    onSend: (f: { name: string; text: string }) => Promise<boolean>,
    onBack: () => void,
  ): void {
    const panel = this.panel();
    const nameRow = this.input('Nimimerkki', name, FEEDBACK_LIMITS.name, 'valinnainen');
    const nameInput = nameRow.querySelector('input')!;
    const text = document.createElement('textarea');
    text.maxLength = FEEDBACK_LIMITS.text;
    text.rows = 6;
    text.placeholder = 'Mikä toimi, mikä ei? Bugit, toiveet, kalajutut…';
    const status = h('p', '', 'hint');
    const send = async () => {
      if (!text.value.trim()) {
        status.textContent = 'Kirjoita ensin jotain.';
        return;
      }
      status.textContent = 'Lähetetään…';
      const ok = await onSend({ name: nameInput.value, text: text.value });
      if (ok) {
        text.value = '';
        status.textContent = 'Kiitos! Palaute tallentui.';
      } else {
        status.textContent = 'Lähetys epäonnistui: pelipalvelin ei vastaa. Yritä myöhemmin.';
      }
    };
    panel.append(
      h('h2', 'Palaute'),
      h('p', 'Palaute menee pelipalvelimelle Luukan luettavaksi.', 'hint'),
      nameRow,
      text,
      status,
      this.buttons([
        ['Lähetä', () => void send()],
        ['Takaisin', onBack],
      ]),
    );
    this.show(panel);
    text.focus();
  }

  /** Äänenvoimakkuudet alkuvalikosta. */
  showAudio(
    current: AudioSettings,
    onChange: (a: AudioSettings) => void,
    onBack: () => void,
  ): void {
    const panel = this.panel();
    panel.append(
      h('h2', 'Äänet'),
      this.audioEditor(current, onChange),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  private audioEditor(initial: AudioSettings, onChange: (a: AudioSettings) => void): HTMLElement {
    const a = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const row = (label: string, key: keyof AudioSettings) =>
      this.choice(
        label,
        VOLUME_LEVELS.map((o) => [String(o.value), o.label]),
        String(a[key]),
        (v) => {
          a[key] = Number(v) as VolumeLevel;
          onChange({ ...a });
        },
      );
    box.append(
      row('Tehosteet', 'effects'),
      row('Tuuli, sade ja linnut', 'ambience'),
      row('Musiikki', 'music'),
    );
    return box;
  }

  /** Tekijät, kartta-aineistojen lähdemaininnat ja kirjastojen lisenssit. */
  showCredits(onBack: () => void): void {
    const panel = this.panel();
    const list = (items: (string | HTMLElement)[]) => {
      const ul = document.createElement('ul');
      ul.className = 'credits';
      for (const item of items) {
        const li = document.createElement('li');
        li.append(item);
        ul.appendChild(li);
      }
      return ul;
    };
    const link = (text: string, url: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = text;
      return a;
    };
    panel.append(
      h('h2', 'Tekijät ja lähteet'),
      h('p', 'Lunki: Luuka Lindgren ja Claude Code. Äänet syntetisoidaan selaimessa.'),
      h('p', 'Kartta-aineistot', 'choice-label'),
      list(mapCredits()),
      h(
        'p',
        'Lunkinjärvestä ei ole julkista luotausaineistoa, joten pohja on laskettu rantaviivasta ja syvänteet ja karikot ovat keksittyjä.',
        'hint',
      ),
      h('p', 'Kirjastot', 'choice-label'),
      list(
        LIBRARIES.map((l) => {
          const span = document.createElement('span');
          span.append(link(l.name, l.url), ` – ${l.license}`);
          return span;
        }),
      ),
      list([link('OpenStreetMapin tekijänoikeudet', 'https://www.openstreetmap.org/copyright')]),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  /** Järven ennätyslista vaikeustasoittain; null = palvelinta ei tavoitettu. */
  showRecords(board: RecordBoard | null, initial: Difficulty, onBack: () => void): void {
    const panel = this.panel();
    panel.append(h('h2', 'Lunkinjärven ennätykset'));
    if (!board) {
      panel.append(
        h('p', 'Pelipalvelimeen ei saatu yhteyttä, joten ennätyksiä ei voitu hakea.', 'error'),
        this.buttons([['Takaisin', onBack]]),
      );
      this.show(panel);
      return;
    }
    const lists = document.createElement('div');
    const render = (d: Difficulty) => {
      lists.replaceChildren();
      for (const o of SPECIES_OPTIONS) {
        const rows = board[d]?.[o.value] ?? [];
        if (rows.length === 0 && !o.native) continue;
        lists.append(h('p', o.label, 'choice-label'));
        const ol = document.createElement('ol');
        ol.className = 'catch-list records';
        for (const r of rows) {
          const li = document.createElement('li');
          li.textContent = `${formatWeight(r.weight).padStart(8)}  ${r.angler.padEnd(16)} ${formatDate(r.date)}`;
          ol.appendChild(li);
        }
        if (rows.length === 0) ol.append(h('li', 'Ei vielä saaliita', 'hint'));
        lists.append(ol);
      }
    };
    render(initial);
    panel.append(
      this.choice(
        'Vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        initial,
        (v) => render(v as Difficulty),
      ),
      lists,
      h('p', 'Listalle pääsevät moninpelikisoissa palvelimella punnitut kalat.', 'hint'),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  showPause(
    onResume: () => void,
    onQuit: () => void,
    multiplayer = false,
    tackle?: { current: Tackle; onChange: (t: Tackle) => void },
    audio?: { current: AudioSettings; onChange: (a: AudioSettings) => void },
  ): void {
    const panel = this.panel();
    panel.append(
      h('h2', multiplayer ? 'Valikko' : 'Tauko'),
      ...(multiplayer ? [h('p', 'Kisa jatkuu muilla taustalla.', 'hint')] : []),
      ...(tackle ? [this.tackleEditor(tackle.current, tackle.onChange)] : []),
      ...(audio ? [this.audioEditor(audio.current, audio.onChange)] : []),
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
    tackles?: ReadonlyMap<string, Tackle>,
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
      const gear = tackles?.get(r.id);
      if (gear) li.append(h('span', describeFullTackle(gear), 'player-gear'));
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
        h(
          'p',
          'Ei saalista tällä kertaa. Jos tärppejä ei tule, potki uuteen paikkaan: kaikuluotain (K) näyttää kalat.',
        ),
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
    // Saman näkymän uudelleenpiirto (aula) säilyttää vierityksen.
    const prev = this.root.firstElementChild as HTMLElement | null;
    const same = !!panel.dataset.screen && prev?.dataset.screen === panel.dataset.screen;
    const top = [prev?.scrollTop ?? 0, this.root.scrollTop];
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    if (same) {
      panel.scrollTop = top[0]!;
      this.root.scrollTop = top[1]!;
      return;
    }
    // Kohdistus ei saa vierittää pitkää näkymää alas.
    panel.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
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
      this.speciesChoice(s.species, (species) => change({ species })),
      this.choice(
        'Sää',
        WEATHER_OPTIONS.map((o) => [o.value, o.label]),
        s.weather,
        (v) => change({ weather: v as WeatherLevel }),
      ),
      this.choice(
        'Salama',
        LIGHTNING_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        s.lightningPenalty,
        (v) => change({ lightningPenalty: v as Penalty }),
      ),
      this.choice(
        'Kaatuminen',
        CAPSIZE_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        s.capsizePenalty,
        (v) => change({ capsizePenalty: v as Penalty }),
      ),
    );
    return box;
  }

  /** Varusteet: vapa, viehe, siima ja teräsperukka. */
  private tackleEditor(initial: Tackle, onChange: (t: Tackle) => void): HTMLElement {
    const t = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const rodHint = h('p', RODS[t.rod].hint, 'hint');
    const hint = h('p', LURES[t.lure].hint, 'hint');
    const set = (patch: Partial<Tackle>) => {
      Object.assign(t, patch);
      rodHint.textContent = RODS[t.rod].hint;
      hint.textContent = LURES[t.lure].hint;
      onChange({ ...t });
    };
    const beginner = document.createElement('button');
    beginner.textContent = 'Aloittelijan varusteet';
    beginner.title = describeFullTackle(DEFAULT_TACKLE);
    beginner.addEventListener('click', () => {
      onChange({ ...DEFAULT_TACKLE });
      box.replaceWith(this.tackleEditor(DEFAULT_TACKLE, onChange));
    });
    box.append(
      this.choice(
        'Vapa',
        ROD_IDS.map((id) => [id, RODS[id].name]),
        t.rod,
        (v) => set({ rod: v as Tackle['rod'] }),
      ),
      rodHint,
      this.choice(
        'Viehe (R)',
        LURE_IDS.map((id) => [id, LURES[id].name]),
        t.lure,
        (v) => set({ lure: v as Tackle['lure'] }),
      ),
      hint,
      this.choice(
        'Siima',
        LINE_IDS.map((id) => [
          id,
          `${LINES[id].name} (${String(LINES[id].strength).replace('.', ',')} kg)`,
        ]),
        t.line,
        (v) => set({ line: v as Tackle['line'] }),
      ),
      this.choice(
        'Teräsperukka',
        [
          ['no', 'Ei'],
          ['yes', 'Kyllä'],
        ],
        t.leader ? 'yes' : 'no',
        (v) => set({ leader: v === 'yes' }),
      ),
      h(
        'p',
        'Ohut siima heittyy pidemmälle mutta katkeaa helpommin. Hauki voi purra siiman poikki ilman perukkaa.',
        'hint',
      ),
      beginner,
    );
    return box;
  }

  /** Monivalinta: järven kalalajit. Vähintään yksi laji jää aina valituksi. */
  private speciesChoice(
    initial: readonly SpeciesId[],
    onChange: (species: SpeciesId[]) => void,
  ): HTMLElement {
    const selected = new Set(initial);
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', 'Kalalajit', 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const o of SPECIES_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = o.native ? o.label : `${o.label}*`;
      if (!o.native) b.title = 'Ei elä Lunkinjärvessä';
      b.classList.toggle('selected', selected.has(o.value));
      b.addEventListener('click', () => {
        if (selected.has(o.value)) {
          if (selected.size === 1) return;
          selected.delete(o.value);
        } else selected.add(o.value);
        b.classList.toggle('selected', selected.has(o.value));
        onChange(SPECIES_OPTIONS.map((x) => x.value).filter((v) => selected.has(v)));
      });
      group.appendChild(b);
    }
    row.append(group, h('p', '* Ei Lunkinjärven oma laji, lisätään huvin vuoksi.', 'hint'));
    return row;
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
        `${label(LIGHTNING_PENALTY_OPTIONS, s.lightningPenalty)} / ${label(CAPSIZE_PENALTY_OPTIONS, s.capsizePenalty)}`,
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

const NEEDS_KEYBOARD = 'Peli tarvitsee näppäimistön ja hiiren: avaa sivu tietokoneella.';

/** Laitteessa on vain kosketusnäyttö (puhelin tai tabletti ilman hiirtä). */
function touchOnly(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches &&
    !matchMedia('(any-pointer: fine)').matches
  );
}

function h(tag: string, text: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** 2026-10-25 → 25.10.2026 */
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)}.${Number(m)}.${y}` : iso;
};
