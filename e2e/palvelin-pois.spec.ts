import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/**
 * Pelipalvelin (Luukan pelikone) on usein kiinni. Silloin kaiken muun kuin
 * moninpelin pitää toimia, eikä mikään näkymä saa jäädä odottamaan pitkään.
 *
 * Palvelin "sammutetaan" sieppaamalla selaimen pyynnöt pelipalvelimeen:
 * - `refused`: kone kiinni, yhteys hylätään heti
 * - `tunnel`: Cloudflare-tunneli vastaa itse 530:llä ilman CORS-otsakkeita
 * - `hang`: pyynnöt jäävät roikkumaan (huono verkko, jumittunut tunneli)
 */
type Off = 'refused' | 'tunnel' | 'hang';

const SERVER = /^(http|ws)s?:\/\/localhost:2567\//;

async function serverOff(page: Page, mode: Off) {
  const requests: string[] = [];
  await page.route(SERVER, async (route) => {
    const req = route.request();
    requests.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if (mode === 'refused') return route.abort('connectionrefused');
    if (mode === 'tunnel') return route.fulfill({ status: 530, body: 'error code: 1033' });
    // hang: ei vastata koskaan.
  });
  await page.routeWebSocket(SERVER, (ws) => {
    requests.push(`WS ${new URL(ws.url()).pathname}`);
    if (mode !== 'hang') void ws.close({ code: 1011 });
  });
  return requests;
}

/**
 * Palvelimen poissaolo näkyy selaimen konsolissa verkkovirheinä (ei pelin
 * virheinä): ne sallitaan, muut virheet eivät.
 */
function watchAppErrors(page: Page) {
  const w = watchErrors(page);
  return {
    check: () =>
      expect(
        w.errors.filter(
          (e) =>
            !/testivirhe|Failed to load resource|CORS|access control|ERR_CONNECTION_REFUSED|ERR_FAILED|NetworkError|WebSocket|Cross-Origin|Fetch API cannot load|due to access control/i.test(
              e,
            ),
        ),
        w.errors.join('\n'),
      ).toEqual([]),
  };
}

for (const mode of ['refused', 'tunnel', 'hang'] as const) {
  test.describe(`palvelin pois päältä (${mode})`, () => {
    test('yksinpeli, kartta, ennätykset, palaute ja moninpelivalikko toimivat', async ({
      page,
    }) => {
      const errors = watchAppErrors(page);
      const requests = await serverOff(page, mode);
      await page.goto('/?view=top');
      const title = page.locator('.screen-panel h2').first();

      // Ennätykset: selkeä ilmoitus nopeasti, ei jäädä pyörimään.
      await page.getByRole('button', { name: 'Ennätykset' }).click();
      await expect(page.getByText(/ei ole nyt päällä/)).toBeVisible({ timeout: 6000 });
      await expect(page.locator('.loader')).toHaveCount(0);
      await page.getByRole('button', { name: 'Takaisin' }).click();

      // Järvikartta.
      await page.getByRole('button', { name: 'Järvikartta' }).click();
      await expect(page.locator('.map-panel canvas').first()).toBeVisible();
      await page.getByRole('button', { name: 'Takaisin' }).click();

      // Palaute: ei jää "Lähetetään…"-tilaan.
      await page.getByRole('button', { name: 'Palaute' }).click();
      await page.locator('textarea').fill('Testipalaute palvelin pois päältä');
      await page.getByRole('button', { name: 'Lähetä' }).click();
      await expect(page.getByText(/ei ole nyt päällä/)).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Takaisin' }).click();

      // Moninpeli: kertoo, ettei palvelin ole päällä, ja huoneen luonti ei jää odottamaan.
      await page.getByRole('button', { name: 'Moninpeli' }).click();
      await expect(page.locator('.server-status')).toHaveText(/ei ole nyt päällä/, {
        timeout: 6000,
      });
      await page.getByRole('button', { name: 'Luo uusi huone' }).click();
      await expect.poll(() => requests.some((r) => r.includes('/matchmake/'))).toBe(true);
      await expect(page.locator('.loader')).toHaveCount(0, { timeout: 8000 });
      await expect(title).toHaveText('Moninpeli');
      await expect(page.locator('.server-status')).toHaveText(/ei ole nyt päällä/);
      await page.getByRole('button', { name: 'Takaisin' }).click();

      // Yksinpeli alkaa ja kello käy.
      await page.getByRole('button', { name: 'Yksinpeli' }).click();
      await page.getByRole('button', { name: 'Aloita kisa' }).click();
      await expect(page.locator('.hud-timer')).toBeVisible();
      const t = await page.locator('.hud-timer').innerText();
      await expect.poll(() => page.locator('.hud-timer').innerText()).not.toBe(t);
      errors.check();
    });
  });
}

test('palaute odottaa selaimessa ja lähtee, kun palvelin on taas päällä', async ({ page }) => {
  const errors = watchAppErrors(page);
  const requests = await serverOff(page, 'refused');
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Palaute' }).click();
  await page.locator('textarea').fill('Odottava palaute');
  await page.getByRole('button', { name: 'Lähetä' }).click();
  await expect(page.getByText(/tallentui tälle laitteelle/)).toBeVisible();
  const pending = () => page.evaluate(() => localStorage.getItem('lunki.feedback.pending'));
  expect(await pending()).toContain('Odottava palaute');

  // Virheraportit: kiinni olevalle palvelimelle ei yritetä lähettää uudelleen ja uudelleen.
  for (let i = 0; i < 4; i++) {
    await page.evaluate((n) => setTimeout(() => Promise.reject(new Error(`testivirhe ${n}`))), i);
    await page.waitForTimeout(300);
  }
  expect(requests.filter((r) => r === 'POST /errors')).toHaveLength(1);

  // Palvelin palaa: seuraava avaus lähettää palautteen.
  await page.unroute(SERVER);
  await page.reload();
  await expect.poll(pending).toBeNull();
  errors.check();
});

test('kutsulinkki palvelimen ollessa kiinni avaa moninpelivalikon koodin kanssa', async ({
  page,
}) => {
  const errors = watchAppErrors(page);
  const requests = await serverOff(page, 'tunnel');
  await page.goto('/?huone=LUNKI-ABCD');
  await expect(page.locator('.server-status')).toHaveText(/ei ole nyt päällä/);
  await expect(page.getByLabel('Huonekoodi')).toHaveValue('LUNKI-ABCD');
  await page.getByRole('button', { name: 'Liity koodilla' }).click();
  await expect.poll(() => requests.some((r) => r.includes('/matchmake/'))).toBe(true);
  await expect(page.locator('.loader')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('.server-status')).toHaveText(/ei ole nyt päällä/);
  await expect(page.getByLabel('Huonekoodi')).toHaveValue('LUNKI-ABCD');
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await expect(page.getByRole('button', { name: 'Yksinpeli' })).toBeVisible();
  errors.check();
});

test('yksinpelin saalis odottaa laitteella ja pääsee listalle saantipäivällään', async ({
  page,
}, info) => {
  const errors = watchAppErrors(page);
  // Saalis kolmen päivän takaa, tallentunut palvelimen ollessa kiinni.
  const day = new Date(Date.now() - 3 * 24 * 3600_000);
  day.setUTCHours(12, 0, 0, 0);
  const angler = `Jono-${info.project.name}`.slice(0, 16);
  const pending = [
    {
      species: 'perch',
      weight: 1.6 - info.workerIndex / 1000,
      angler,
      difficulty: 'normal',
      at: day.toISOString(),
    },
  ];
  await page.addInitScript((list) => {
    if (!sessionStorage.getItem('jono')) {
      sessionStorage.setItem('jono', '1');
      localStorage.setItem('lunki.solo.pending', JSON.stringify(list));
    }
  }, pending);
  const queued = () => page.evaluate(() => localStorage.getItem('lunki.solo.pending'));

  // Palvelin kiinni: saalis pysyy tallessa, ja ennätysnäkymä kertoo sen.
  await serverOff(page, 'refused');
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Ennätykset' }).click();
  await expect(page.getByText(/tallentuvat tälle laitteelle/)).toBeVisible();
  expect(await queued()).toContain(angler);

  // Palvelin palaa: avaus lähettää saaliin, ja päävalikko kertoo sijan.
  await page.unroute(SERVER);
  await page.reload();
  await expect(page.locator('.start-note')).toContainText(/Tallessa ollut saalis: .*Ahven/);
  await expect.poll(queued).toBeNull();
  await page.getByRole('button', { name: 'Ennätykset' }).click();
  await page.locator('.choice').first().getByRole('button', { name: 'Yksinpeli' }).click();
  const date = `${day.getUTCDate()}.${day.getUTCMonth() + 1}.${day.getUTCFullYear()}`;
  await expect(page.locator('li.record-row', { hasText: angler }).first()).toContainText(date);
  errors.check();
});
