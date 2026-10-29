import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Kerää sivun kaatumiset ja konsolin virheet. Testin lopussa `check()`
 * varmistaa, ettei peli heittänyt poikkeuksia missään selaimessa.
 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  // Virheet myös testin tulosteeseen, jotta CI:n lokista näkee syyn.
  const add = (e: string) => {
    errors.push(e);
    console.log(e);
  };
  page.on('pageerror', (e) => {
    // Colyseus kokeilee ensin Node-tyylistä WebSocket-kutsua ja ottaa virheen
    // kiinni; WebKit raportoi sen silti. Yhteys toimii, joten ohitetaan.
    if (e.message.startsWith('Wrong protocol for WebSocket')) return;
    add(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Firefox hylkää sivun keskeneräiset lupaukset uudelleenlatauksessa ja
    // kirjaa sen virheeksi. Sivu on jo lähdössä, joten ohitetaan.
    if (m.text().includes('InvalidStateError: Navigated away from page')) return;
    add(`console: ${m.text()}`);
  });
  return {
    errors,
    check: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

/**
 * Laskee pelikuvan erilaiset värit. WebGL-kanvaasin piirtopuskuri tyhjenee
 * ruudun näyttämisen jälkeen, joten kuva kopioidaan sivulla
 * requestAnimationFramessa heti pelin oman piirron perään (pelisilmukka pyytää
 * seuraavan ruudun piirrettyään, joten sen kutsu on jonossa ensin). Ruutukaappaus
 * olisi hidas: CI:n ohjelmistorenderöinnillä Chromiumin kaappaus kestää 5–25 s,
 * jolloin odotus ehti vanhentua. Musta tai yksivärinen kuva = WebGL ei piirrä.
 */
export function canvasColors(page: Page): Promise<number> {
  return page.locator('canvas.game-canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const c = document.createElement('canvas');
          c.width = canvas.width;
          c.height = canvas.height;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(canvas, 0, 0);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set<number>();
          // Joka 7. pikseli riittää: retrokuvassa on vain kymmeniä värejä.
          for (let i = 0; i < data.length; i += 28)
            seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
          resolve(seen.size);
        }),
      ),
  );
}

/** Kompassinauhan siirtymä: muuttuu, kun kalastaja kääntyy. */
export function compassOffset(page: Page): Promise<string> {
  return page.locator('.hud-compass-strip').evaluate((e) => (e as HTMLElement).style.transform);
}

/** Kisan kello HUD:ssa (esim. "9:58"). */
export function timer(page: Page): Promise<string> {
  return page.locator('.hud-timer').innerText();
}

/** Tallennetaan AudioContextit, jotta testi näkee, käynnistyikö ääni. */
export async function trackAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      __audio: AudioContext[];
    };
    w.__audio = [];
    const Original = w.AudioContext;
    if (!Original) return;
    w.AudioContext = class extends Original {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audio.push(this);
      }
    };
  });
}

export function audioStates(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __audio: AudioContext[] }).__audio.map((c) => c.state),
  );
}

/**
 * Kisojen siemen. Ilman sitä aloituspaikka ja sää arvotaan joka kerta, jolloin
 * esimerkiksi tuulivaroitus voi peittää testin odottaman ilmoituksen tai
 * perhon takaheitto osua rannan puihin. Tällä siemenellä (Realistinen sää) on
 * tyyntä ensimmäiset 18 minuuttia ja aloituspaikan takana on avovettä. Siemen
 * myös jättää saaliit pois ennätyslistalta (main.ts).
 */
export const SEED = 8;

/** Pelin osoite kiinteällä siemenellä; `top` = ylhäältä katsottuna (ks. startSolo). */
export function soloUrl(view: 'pov' | 'top' = 'top'): string {
  return view === 'top' ? `/?view=top&seed=${SEED}` : `/?seed=${SEED}`;
}

/**
 * Yksinpeli oletusasetuksilla. Kisa alkaa pelissä kalastajan silmin (POV), mutta
 * testit, jotka eivät koske näkymää, ajetaan ylhäältä (?view=top): POV piirtyy
 * CI:n ohjelmistorenderöinnillä vain muutaman kuvan sekunnissa.
 */
export async function startSolo(page: Page, view: 'pov' | 'top' = 'top'): Promise<void> {
  await page.goto(soloUrl(view));
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await raceRunning(page);
}

/**
 * Kisa on käynnissä ja HUD asettunut: kello näyttää aikaa. Pelkkä näkyvyys ei
 * riitä mittauksiin, sillä ensimmäisessä ruudussa kello on vielä tyhjä ja matala.
 */
export async function raceRunning(page: Page): Promise<void> {
  await expect(page.locator('.hud-timer')).toHaveText(/\d+:\d\d/);
}

/** Pelipalvelin testeissä (playwright.config.ts). */
export const SERVER_URL = 'http://localhost:2567';

/**
 * Paino, jolla saalis nousee yksinpelin ennätyslistan kärkeen (`base` tai
 * kärkikalaa hieman painavampi). Palvelin on yhteinen kaikille projekteille,
 * toistoille ja uusinnoille, ja listalla on vain viisi kalaa lajia kohden:
 * kiinteällä painolla testin oma saalis putoaisi listalta, kun testi on
 * ajettu muutaman kerran saman palvelimen aikana.
 */
export async function topWeight(
  request: APIRequestContext,
  species: string,
  base: number,
  difficulty = 'normal',
): Promise<number> {
  const res = await request.get(`${SERVER_URL}/records/solo`);
  expect(res.ok()).toBe(true);
  const board = (await res.json()) as Record<string, Record<string, { weight: number }[]>>;
  const top = board[difficulty]?.[species]?.[0]?.weight ?? 0;
  return Math.round((Math.max(base, top) + 0.001) * 1000) / 1000;
}
