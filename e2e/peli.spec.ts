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
    await startSolo(page, 'pov');

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

    // Kisa alkaa kalastajan silmin; V vaihtaa ylhäältä katsottuun ja takaisin.
    await page.keyboard.press('KeyV');
    await expect(page.locator('.hud-message')).toHaveText('Ylhäältä (V)');
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await page.keyboard.press('KeyV');
    await expect(page.locator('.hud-message')).toHaveText('Kalastajan silmin (V)');

    // Ääni käynnistyy ensimmäisestä painalluksesta (autoplay-sääntö). CI:n
    // virtuaalinäytöllä Firefoxilla ei ole äänilaitetta, joten siellä riittää,
    // että ääni yritettiin käynnistää.
    if (browserName === 'firefox' && process.env.CI)
      await expect.poll(() => audioStates(page)).toHaveLength(1);
    else await expect.poll(() => audioStates(page)).toContain('running');

    // Tauko ja paluu. Taukovalikossa on koko näytön nappi.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Jatka' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Koko näyttö' })).toBeVisible();
    await page.getByRole('button', { name: 'Jatka' }).click();
    await expect(page.locator('.hud-timer')).toBeVisible();

    errors.check();
  });

  test('heitto pelkällä näppäimistöllä: välilyönti pohjassa ja päästä', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'puhelimet: ks. kosketus.spec.ts');
    const errors = watchErrors(page);
    await startSolo(page);
    const line = async () => {
      const text = (await page.locator('.hud-status').textContent()) ?? '';
      return Number(/Siimaa ([\d,]+) m/.exec(text)?.[1]?.replace(',', '.') ?? 0);
    };
    await expect.poll(line).toBe(0);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    // Viehe lentää katsesuuntaan ja siimaa on ulkona ilman hiirtä.
    await expect.poll(line, { timeout: 10_000 }).toBeGreaterThan(3);
    errors.check();
  });

  test('perho: kalastustapa taukovalikosta, rytmiheitto ja vedot välilyönnillä (#234, #235)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'puhelimet: ks. kosketus.spec.ts');
    const errors = watchErrors(page);
    await startSolo(page);
    const status = async () => (await page.locator('.hud-status').textContent()) ?? '';
    const metres = (re: RegExp) => async () =>
      Number(re.exec(await status())?.[1]?.replace(',', '.') ?? 0);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Perho', exact: true }).click();
    await page.getByRole('button', { name: 'Jatka' }).click();
    await expect.poll(status).toContain('Hauki-streameri');
    await expect.poll(status).toContain('Löysää 0,0 m');

    // Rytmiheitto: välilyönti tekee takaheiton, ja kun siima on suorassa ("NYT!"), eteenheiton.
    // Hitaalla koneella "NYT!" voi kestää vain ruudun tai kaksi, joten eteenheiton
    // välilyönti painetaan sivulla heti, kun merkki ilmestyy.
    await page.evaluate(() => {
      const meter = document.querySelector('.hud-power')!;
      const observer = new MutationObserver(() => {
        if (!meter.classList.contains('fly-now')) return;
        observer.disconnect();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 50);
      });
      observer.observe(meter, { attributes: true, attributeFilter: ['class'] });
    });
    await page.keyboard.press('Space');
    await expect(page.locator('.hud-power')).toBeVisible();
    await expect(page.locator('.hud-status')).toContainText('Välilyönti, kun siima suoristuu');
    await expect(page.locator('.hud-message')).toContainText(/Heitto \d+ m/, { timeout: 10_000 });
    await expect.poll(metres(/Siimaa ([\d,]+) m/), { timeout: 10_000 }).toBeGreaterThan(3);
    // Välilyönti pohjassa vetää siimaa renkaan eteen löysäksi.
    await page.keyboard.down('Space');
    await expect.poll(metres(/Löysää ([\d,]+) m/), { timeout: 15_000 }).toBeGreaterThan(0.5);
    await page.keyboard.up('Space');
    errors.check();
  });

  test('HUDin koko taukovalikosta: reunat pysyvät, valinta säilyy', async ({ page, isMobile }) => {
    test.skip(isMobile, 'puhelimet: ks. kosketus.spec.ts');
    const errors = watchErrors(page);
    await startSolo(page);
    const timerBox = () => page.locator('.hud-timer').boundingBox();
    const tension = () => page.locator('.hud-tension').boundingBox();
    const before = (await timerBox())!;
    const { width } = page.viewportSize()!;

    await page.keyboard.press('Escape');
    const slider = page.locator('#hud-size');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(page.locator('label[for=hud-size]')).toHaveText('HUDin koko 70 %');
    await page.getByRole('button', { name: 'Jatka' }).click();

    // Pienempi, mutta samassa kulmassa samalla reunavälillä.
    const small = (await timerBox())!;
    expect(small.height).toBeLessThan(before.height * 0.8);
    expect(small.x).toBeCloseTo(before.x, 0);
    expect(small.y).toBeCloseTo(before.y, 0);
    const t = (await tension())!;
    expect(width - (t.x + t.width)).toBeCloseTo(before.x, 0);

    // Asetus säilyy uudelleenlatauksen yli.
    await startSolo(page);
    expect((await timerBox())!.height).toBeCloseTo(small.height, 0);
    errors.check();
  });

  test('näkökentän säädin taukovalikosta ja asetuksista (#330)', async ({ page, isMobile }) => {
    const errors = watchErrors(page);
    await startSolo(page, 'pov');
    const canvas = page.locator('canvas.game-canvas');
    const label = page.locator('label[for=pov-fov]');
    // Pystypuhelimella kuvaa levennetään jo oletuksella.
    if (isMobile) {
      await expect
        .poll(async () => Number(await canvas.getAttribute('data-pov-fov')))
        .toBeGreaterThan(90);
      return errors.check();
    }
    await expect(canvas).toHaveAttribute('data-pov-fov', '72');

    await page.keyboard.press('Escape');
    await expect(label).toHaveText('Näkökenttä 72°');
    const slider = page.locator('#pov-fov');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(label).toHaveText('Näkökenttä 80°');
    await expect(canvas).toHaveAttribute('data-pov-fov', '80');
    await page.getByRole('button', { name: 'Jatka' }).click();

    // Valinta säilyy uudelleenlatauksen yli ja näkyy päävalikon asetuksissa.
    await startSolo(page, 'pov');
    await expect(canvas).toHaveAttribute('data-pov-fov', '80');
    await page.goto('/');
    await page.getByRole('button', { name: 'Asetukset' }).click();
    await expect(label).toHaveText('Näkökenttä 80°');
    await expect(page.getByText('Tehosteet')).toBeVisible();
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

test('toinen kisa ja valikon tausta piirtävät jaetun maailman (#327)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'puhelimet: ks. kosketus.spec.ts');
  const errors = watchErrors(page);
  await startSolo(page, 'pov');
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
  const first = await canvasColors(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Lopeta kisa' }).click();
  await page.getByRole('button', { name: 'Valikkoon' }).click();
  await expect(page.getByRole('button', { name: 'Yksinpeli' })).toBeVisible();
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
  // Maasto, puut ja rannat rakennettiin kerran; uusi kisa ottaa ne käyttöön.
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(Math.max(8, first / 2));
  errors.check();
});

test('kieli vaihtuu päävalikosta heti ja säilyy uudelleenlatauksen jälkeen', async ({
  page,
  isMobile,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Single player' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Single player' })).toBeVisible();

  // Kisan HUD englanniksi.
  await page.getByRole('button', { name: 'Single player' }).click();
  await page.getByRole('button', { name: 'Start the competition' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  await expect(page.locator('.hud-tension-label')).toHaveText('TENSION');
  await expect(page.locator('.hud-compass')).toContainText('N');
  if (!isMobile) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'End the competition' }).click();
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('button', { name: 'Suomi' }).click();
    await expect(page.getByRole('button', { name: 'Yksinpeli' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  }
  errors.check();
});

test('englanninkielinen selain saa pelin englanniksi', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Multiplayer' })).toBeVisible();
  await ctx.close();
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

test('valittu väri ei piirry kisan painikkeiden päälle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  const swatch = page.locator('.settings.appearance .swatches').first().locator('button').nth(10);
  await swatch.click();
  await expect(swatch).toHaveClass(/selected/);
  // Vieritetään valittu väri paneelin alareunan painikkeiden alle.
  const hidden = await swatch.evaluate((sel) => {
    const panel = sel.closest('.screen-panel')!;
    const footer = panel.querySelector(':scope > .buttons:last-child')!;
    const f = footer.getBoundingClientRect();
    panel.scrollTop += sel.getBoundingClientRect().top - (f.top + f.height / 2);
    const r = sel.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!top && footer.contains(top);
  });
  expect(hidden).toBe(true);
});
