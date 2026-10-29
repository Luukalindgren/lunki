import { expect, test, type Page } from '@playwright/test';
import { canvasColors, watchErrors } from './apu';

/**
 * Service worker (#328): pelin tiedostot tallentuvat laitteelle, joten peli
 * aukeaa ja yksinpeli toimii ilman nettiä, ja uusi versio otetaan käyttöön
 * valikon napista.
 */
test.use({ serviceWorkers: 'allow' });

/** Odottaa, että service worker on asentunut ja ohjaa sivua. */
async function waitControlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null)))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test('peli aukeaa ja yksinpeli toimii ilman nettiä (#328)', async ({
  page,
  context,
  browserName,
}) => {
  const w = watchErrors(page);
  await page.goto('/?view=top');
  await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
  await waitControlled(page);
  // Pelin tiedostot ovat välimuistissa: sivu, koodi ja tyylit.
  const cached = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]!);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain('/index.html');
  expect(cached.some((p) => /^\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(cached.some((p) => /^\/assets\/index-.*\.css$/.test(p))).toBe(true);
  // Playwrightin WebKit ei osaa sivun uudelleenlatausta verkotilassa service
  // workerin kanssa ("internal error"), joten siellä riittää välimuistin tarkistus.
  if (browserName === 'webkit') return w.check();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
  // Ilman nettiä palvelimen tarkistukset epäonnistuvat; muita virheitä ei saa tulla.
  expect(
    w.errors.filter(
      (e) => !/Failed to load resource|NetworkError|ERR_INTERNET|network|WebSocket/i.test(e),
    ),
    w.errors.join('\n'),
  ).toEqual([]);
});

test('uusi versio otetaan käyttöön valikon napista (#328)', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'service workerin skriptin sieppaus toimii vain Chromiumissa',
  );
  const errors = watchErrors(page);
  // Ensimmäinen asennus saa vanhan versiotunnisteen, joten seuraava
  // tarkistus löytää buildin oikean version kuin uusi julkaisu.
  await page.context().route(
    '**/sw.js',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /const VERSION = "[^"]*"/,
        'const VERSION = "vanha"',
      );
      await route.fulfill({ status: 200, contentType: 'text/javascript', body });
    },
    { times: 1 },
  );
  await page.goto('/?view=top');
  await waitControlled(page);
  expect(await page.evaluate(() => caches.keys())).toEqual(['lunki-vanha']);
  await expect(page.locator('.update-notice')).toHaveCount(0);

  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg!.update();
  });
  const notice = page.getByRole('button', { name: 'Uusi versio saatavilla – päivitä' });
  await expect(notice).toBeVisible();
  await Promise.all([page.waitForEvent('load'), notice.click()]);
  await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
  await expect(page.locator('.update-notice')).toHaveCount(0);
  // Uusi versio ohjaa sivua, ja vanhan version tiedostot on siivottu.
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^lunki-[0-9a-f]{12}$/);
  errors.check();
});
