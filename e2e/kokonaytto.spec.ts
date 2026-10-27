import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

const fullscreen = (page: Page) => page.evaluate(() => Boolean(document.fullscreenElement));

/**
 * Firefox ja Safari eivät päästä Esciä peliin koko näytöllä: selain poistuu
 * koko näytöstä ja syö painalluksen. Peli antaa Escin itse ja palaa koko
 * näyttöön seuraavasta painalluksesta. Selaimen Esc-poistuminen jäljitellään
 * Chromiumissa ilman näppäinlukitusta.
 */
test('Esc ilman näppäinlukitusta: valikko aukeaa ja koko näyttö palaa', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || isMobile, 'ajetaan kerran, chromium-projektissa');
  const errors = watchErrors(page);
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'keyboard', { get: () => undefined }),
  );
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Koko näyttö' }).click();
  await expect.poll(() => fullscreen(page)).toBe(true);
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  const pause = page.locator('[data-screen=pause]');

  // Selain poistuu koko näytöstä Escillä: taukovalikko aukeaa silti.
  await page.evaluate(() => document.exitFullscreen());
  await expect(pause).toBeVisible();
  await expect(pause.getByText('Esc irrottaa koko näytöstä hetkeksi')).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Poistu koko näytöstä' })).toBeVisible();

  // Seuraava painallus palauttaa koko näytön.
  await page.getByRole('button', { name: 'Jatka' }).click();
  await expect(pause).toHaveCount(0);
  await expect.poll(() => fullscreen(page)).toBe(true);

  // Valikon napilla poistutaan pysyvästi.
  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: 'Poistu koko näytöstä' }).click();
  await expect(pause.getByRole('button', { name: 'Koko näyttö' })).toBeVisible();
  await page.getByRole('button', { name: 'Jatka' }).click();
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);
  expect(await fullscreen(page)).toBe(false);
  errors.check();
});
