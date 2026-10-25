import { expect, test } from '@playwright/test';
import {
  audioStates,
  canvasColors,
  compassOffset,
  startSolo,
  timer,
  trackAudio,
  watchErrors,
} from './apu';

test.describe('yksinpeli', () => {
  test('valikko, kisa, ohjaus, POV ja ääni', async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, 'puhelimet: ks. kosketus.spec.ts');
    const errors = watchErrors(page);
    await trackAudio(page);
    await startSolo(page);

    // Pelisilmukka pyörii ja WebGL piirtää järven.
    const t0 = await timer(page);
    await expect.poll(() => timer(page), { timeout: 15_000 }).not.toBe(t0);
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);

    // Näppäimistöllä kääntyminen (A pohjassa) kääntää kompassia.
    const before = await compassOffset(page);
    await page.keyboard.down('KeyA');
    await expect.poll(() => compassOffset(page)).not.toBe(before);
    await page.keyboard.up('KeyA');

    // Hiiren klikkaus (tähtäys ja heitto) ei kaada peliä.
    const box = (await page.locator('canvas.game-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();

    // Kalastajan silmin (V) ja takaisin.
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(1500);
    // Ohjelmistorenderöinnillä POV:n ensimmäiset kuvat ovat CI:ssä hitaita.
    await expect.poll(() => canvasColors(page), { timeout: 45_000 }).toBeGreaterThan(8);
    await page.keyboard.press('KeyV');

    // Ääni käynnistyy ensimmäisestä painalluksesta (autoplay-sääntö). CI:n
    // virtuaalinäytöllä Firefoxilla ei ole äänilaitetta, joten siellä riittää,
    // että ääni yritettiin käynnistää.
    if (browserName === 'firefox' && process.env.CI)
      await expect.poll(() => audioStates(page)).toHaveLength(1);
    else await expect.poll(() => audioStates(page)).toContain('running');

    // Tauko ja paluu.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Jatka' })).toBeVisible();
    await page.getByRole('button', { name: 'Jatka' }).click();
    await expect(page.locator('.hud-timer')).toBeVisible();

    errors.check();
  });

  test('järvikartta', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Järvikartta' }).click();
    await expect(page.locator('.map-panel canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Takaisin' }).click();
    await expect(page.getByRole('button', { name: 'Yksinpeli' })).toBeVisible();
    errors.check();
  });
});

test('ilman WebGL:ää näytetään selitys tyhjän ruudun sijaan', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByText('Grafiikka ei käynnisty')).toBeVisible();
  await expect(page.getByText('laitteistokiihdytys')).toBeVisible();
});
