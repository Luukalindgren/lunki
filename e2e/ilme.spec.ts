import { expect, test, type Page } from '@playwright/test';
import { canvasColors, raceRunning, soloUrl, watchErrors } from './apu';

/** Piirretyn kuvan leveys kuvapisteinä. */
const canvasWidth = (page: Page) =>
  page.locator('canvas.game-canvas').evaluate((c: HTMLCanvasElement) => c.width);

test.describe('ilme (#674, #650)', () => {
  test('Asetusten valinta vaihtaa Terävään ja kisa käynnistyy', async ({ page, isMobile }) => {
    // Puhelimen täysi tarkkuus (kolminkertainen pikselitiheys) on CI:n
    // ohjelmistorenderöinnille liian raskas; ilmeen vaihto on sama koodi.
    test.skip(isMobile, 'täysi tarkkuus on ohjelmistorenderöinnillä liian hidas');
    const errors = watchErrors(page);
    await page.goto(soloUrl());
    await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
    const retro = await canvasWidth(page);

    await page.getByRole('button', { name: 'Asetukset' }).click();
    const look = page.locator('.choice', {
      has: page.locator('.choice-label', { hasText: /^Ilme$/ }),
    });
    await look.getByRole('button', { name: 'Terävä' }).click();
    // Terävä piirtää näytön tarkkuudella: kuva on vähintään kaksi kertaa leveämpi.
    await expect.poll(() => canvasWidth(page)).toBeGreaterThanOrEqual(retro * 2);
    expect(await page.evaluate(() => localStorage.getItem('lunki.look'))).toBe('sharp');
    // Pikselikuvista käytetään sileitä versioita (`.look-sharp`, `ui/lookArt.ts`).
    await expect(page.locator('html')).toHaveClass(/look-sharp/);
    // HUDin mitta ja ruudulla näkyvä kuva eivät riipu piirron tarkkuudesta.
    const shown = await page
      .locator('canvas.game-canvas')
      .evaluate((c: HTMLCanvasElement) => c.getBoundingClientRect().width);
    expect(shown).toBeGreaterThanOrEqual(page.viewportSize()!.width);

    await page.getByRole('button', { name: 'Takaisin' }).click();
    await page.getByRole('button', { name: 'Pelaa' }).click();
    await page.getByRole('button', { name: 'Yksinpeli' }).click();
    await page.getByRole('button', { name: 'Aloita kisa' }).click();
    await raceRunning(page);
    // Järvi piirtyy: kuvassa on muutakin kuin yksi väri.
    await expect.poll(() => canvasColors(page), { timeout: 30_000 }).toBeGreaterThan(3);

    // Valinta vaihtuu takaisin kesken kisan taukovalikosta.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Asetukset' }).click();
    await look.getByRole('button', { name: 'Retro' }).click();
    await expect.poll(() => canvasWidth(page)).toBe(retro);
    await expect(page.locator('html')).not.toHaveClass(/look-sharp/);
    errors.check();
  });

  test('Moderni ladataan vasta valittaessa ja kisa käynnistyy (#650)', async ({
    page,
    isMobile,
  }) => {
    const errors = watchErrors(page);
    const loaded: string[] = [];
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (path.includes('/modern/')) loaded.push(path);
    });
    await page.goto(soloUrl());
    await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
    const retro = await canvasWidth(page);
    await page.getByRole('button', { name: 'Asetukset' }).click();
    const look = page.locator('.choice', {
      has: page.locator('.choice-label', { hasText: /^Ilme$/ }),
    });
    await expect(look.getByRole('button', { name: 'Terävä' })).toBeVisible();
    const modern = look.getByRole('button', { name: /^Moderni/ });
    if (isMobile) {
      // Moderni on tietokoneen ilme: kosketuslaitteella sitä ei tarjota.
      await expect(modern).toHaveCount(0);
      return;
    }
    // Retron ja Terävän pelaaja ei hae modernin ilmeen tiedostoja.
    expect(loaded).toEqual([]);
    const quality = page.locator('.choice.look-quality');
    await expect(quality).toBeHidden();

    await modern.click();
    await expect(page.locator('html')).toHaveClass(/look-modern/);
    expect(await page.evaluate(() => localStorage.getItem('lunki.look'))).toBe('modern');
    expect(loaded.some((p) => p.endsWith('.js'))).toBe(true);
    expect(loaded.some((p) => p.endsWith('.css'))).toBe(true);
    // Moderni piirtää vähintään näytön tarkkuudella kuten Terävä.
    await expect.poll(() => canvasWidth(page)).toBeGreaterThanOrEqual(retro * 2);
    // Laatu näkyy vain Modernissa. Matala on CI:n ohjelmistorenderöinnille kevyin.
    await expect(quality).toBeVisible();
    await quality.getByRole('button', { name: 'Matala' }).click();
    expect(await page.evaluate(() => localStorage.getItem('lunki.look.quality'))).toBe('low');
    // Teeman kirjasin on käytössä valikossa.
    await expect
      .poll(() => page.locator('.screen-panel h2').evaluate((e) => getComputedStyle(e).fontFamily))
      .toContain('Fraunces');

    await page.getByRole('button', { name: 'Takaisin' }).click();
    await page.getByRole('button', { name: 'Pelaa' }).click();
    await page.getByRole('button', { name: 'Yksinpeli' }).click();
    await page.getByRole('button', { name: 'Aloita kisa' }).click();
    await raceRunning(page);
    await expect.poll(() => canvasColors(page), { timeout: 30_000 }).toBeGreaterThan(3);

    // Takaisin Retroon kesken kisan: teema ja tarkkuus palaavat.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Asetukset' }).click();
    await look.getByRole('button', { name: 'Retro' }).click();
    await expect.poll(() => canvasWidth(page)).toBe(retro);
    await expect(page.locator('html')).not.toHaveClass(/look-modern|look-sharp/);
    await expect(quality).toBeHidden();
    errors.check();
  });
});
