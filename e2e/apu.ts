import { expect, type Page } from '@playwright/test';

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
  page.on('pageerror', (e) => add(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') add(`console: ${m.text()}`);
  });
  return {
    errors,
    check: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

/**
 * Laskee pelikuvan erilaiset värit ruutukaappauksesta. WebGL-kanvaasia ei voi
 * lukea suoraan (piirtopuskuri tyhjenee), joten kuva puretaan sivulla <img>:n
 * kautta. Musta tai yksivärinen kuva = WebGL ei piirrä.
 */
export async function canvasColors(page: Page): Promise<number> {
  const png = await page.locator('canvas.game-canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    // Joka 7. pikseli riittää: retrokuvassa on vain kymmeniä värejä.
    for (let i = 0; i < data.length; i += 28)
      seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    return seen.size;
  }, png.toString('base64'));
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

/** Päävalikosta yksinpeliin oletusasetuksilla. */
export async function startSolo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
}
