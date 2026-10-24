import {
  DIFFICULTY_NAMES,
  DURATIONS,
  formatTime,
  formatWeight,
  summarize,
  type CompetitionSettings,
  type CompetitionState,
  type Difficulty,
} from '@lunki/shared';

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

  showStart(initial: CompetitionSettings, onStart: (s: CompetitionSettings) => void): void {
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
      ]),
      h(
        'p',
        'W/S potki · A/D käänny · hiiri tähtää ja heittää · kelaa hiirellä tai välilyönnillä · Q/E jarru · Esc tauko',
        'hint',
      ),
    );
    this.show(panel);
  }

  showPause(onResume: () => void, onQuit: () => void): void {
    const panel = this.panel();
    panel.append(
      h('h2', 'Tauko'),
      this.buttons([
        ['Jatka', onResume],
        ['Lopeta kisa', onQuit],
      ]),
    );
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
    options: [string, string][],
    selected: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', label, 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const [value, text] of options) {
      const b = document.createElement('button');
      b.textContent = text;
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
