import { expect, test, type Page } from '@playwright/test';
import { audioStates, canvasColors, compassOffset, timer, trackAudio, watchErrors } from './apu';

/**
 * Sormella veto. Chromiumissa oikeat kosketustapahtumat (CDP); WebKitissä
 * Playwright osaa vain napautuksen, joten veto tehdään hiirellä (tatti ei
 * erottele osoitintyyppiä).
 */
async function drag(
  page: Page,
  browserName: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs: number,
) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
      });
    await touch('touchStart', from);
    for (let i = 1; i <= 5; i++)
      await touch('touchMove', {
        x: from.x + ((to.x - from.x) * i) / 5,
        y: from.y + ((to.y - from.y) * i) / 5,
      });
    await page.waitForTimeout(holdMs);
    await touch('touchEnd');
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

test.describe('puhelin', () => {
  test('kosketusohjaimet, POV ja ääni', async ({ page, isMobile, browserName }, info) => {
    test.skip(!isMobile, 'vain puhelinemuloinnit');
    const errors = watchErrors(page);
    await trackAudio(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yksinpeli' }).tap();
    await page.getByRole('button', { name: 'Aloita kisa' }).tap();
    await expect(page.locator('.hud-timer')).toBeVisible();
    await expect(page.locator('.touch-controls')).toBeVisible();

    const t0 = await timer(page);
    await expect.poll(() => timer(page), { timeout: 15_000 }).not.toBe(t0);
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('pysty-pov', { body: await page.screenshot(), contentType: 'image/png' });

    // Tatti oikealle kääntää kalastajaa.
    const stick = (await page.locator('.touch-stick').boundingBox())!;
    const centre = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    const before = await compassOffset(page);
    await drag(page, browserName, centre, { x: centre.x + 60, y: centre.y }, 1500);
    await expect.poll(() => compassOffset(page)).not.toBe(before);

    // Kisa alkoi kalastajan silmin; KAM-nappi vaihtaa ylhäältä katsottuun.
    await page.getByRole('button', { name: 'KAM' }).tap();
    await expect(page.locator('.hud-message')).toHaveText('Ylhäältä (V)');
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('pysty-ylhaalta', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // ELE-nappi avaa käsimerkit; napautus tekee eleen (#228).
    await page.getByRole('button', { name: 'ELE' }).tap();
    await expect(page.locator('.emote-menu')).toBeVisible();
    await page.locator('.emote-option').first().tap();
    await expect(page.locator('.emote-menu')).toBeHidden();

    // NOP-nappi kiertää kelausnopeudet ja pikakelauksen.
    await page.getByRole('button', { name: 'NOP 2' }).tap();
    await page.getByRole('button', { name: 'NOP 3' }).tap();
    await expect(page.getByRole('button', { name: 'PIKA' })).toBeVisible();
    await page.getByRole('button', { name: 'PIKA' }).tap();
    await expect(page.getByRole('button', { name: 'NOP 1' })).toBeVisible();

    // Ääni käynnistyy pelkistä napautuksista.
    await expect.poll(() => audioStates(page)).toContain('running');

    // Vaakasuunta: HUD ja ohjaimet mahtuvat yhä ruudulle.
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(800);
    await expect(page.locator('.touch-stick')).toBeInViewport();
    await expect(page.locator('.touch-reel')).toBeInViewport();
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('vaaka-ylhaalta', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    errors.check();
  });

  test('HEITÄ-nappi heittää katsesuuntaan ja on heiton jälkeen KELAA', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!isMobile, 'vain puhelinemuloinnit');
    const errors = watchErrors(page);
    await page.goto('/?view=top');
    await page.getByRole('button', { name: 'Yksinpeli' }).tap();
    await page.getByRole('button', { name: 'Aloita kisa' }).tap();
    await expect(page.locator('.hud-timer')).toBeVisible();
    const button = page.locator('.touch-reel');
    await expect(button).toHaveText('HEITÄ');

    // Pohjassa lataa kuten välilyönti, irrotus heittää: viehe lähtee ja nappi kelaa.
    const box = (await button.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, browserName, centre, centre, 700);
    await expect(button).toHaveText('KELAA', { timeout: 5_000 });
    errors.check();
  });

  test('perhoheitto pyyhkäisyllä, SIIMA- ja VETO-napit (#236)', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!isMobile, 'vain puhelinemuloinnit');
    const errors = watchErrors(page);
    await page.goto('/?view=top');
    await page.getByRole('button', { name: 'Yksinpeli' }).tap();
    // Helpolla ajoitusikkuna on leveä, joten testin viive ei myöhästytä heittoa.
    await page.getByRole('button', { name: 'Helppo' }).tap();
    await page.getByRole('button', { name: 'Aloita kisa' }).tap();
    await expect(page.locator('.hud-timer')).toBeVisible();
    await page.getByRole('button', { name: 'II' }).tap();
    await page.getByRole('button', { name: 'Perho', exact: true }).tap();
    await page.getByRole('button', { name: 'Jatka' }).tap();
    await expect(page.getByRole('button', { name: 'SIIMA' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'VETO' })).toBeVisible();

    // Pyyhkäisy alas järvellä: takaheitto. Sivukuva näyttää siiman heiton ajan. Pystypuhelimessa
    // ruudun keskilinjan alapäässä on KAM-nappi: siihen osuva pyyhkäisy vaihtaisi POV-näkymään.
    const { width, height } = page.viewportSize()!;
    const x = width * 0.35;
    const y = height * 0.28;
    const message = page.locator('.hud-message');
    // Siima suorassa takana: pyyhkäisy ylös on eteenheitto, ja perho laskeutuu. Kuormitetussa
    // CI:ssä ohjelmistorenderöinnin viive voi myöhästyttää pyyhkäisyn, jolloin takaheitto ehtii
    // pudota veteen: eteenpäin pyyhkäisy on silloin rullaheitto tai siima nostetaan uudelleen.
    let cast = false;
    for (let attempt = 0; attempt < 3 && !cast; attempt++) {
      await drag(page, browserName, { x, y }, { x, y: y + height * 0.3 }, 150);
      if (attempt === 0) {
        await expect(page.locator('.hud-fly-panel')).toBeVisible();
        await expect(page.locator('.hud-status')).toContainText('Alas = takaheitto');
      }
      await page
        .locator('.hud-power.fly-now')
        .waitFor({ timeout: 5_000 })
        .catch(() => undefined);
      await drag(page, browserName, { x, y: y + height * 0.3 }, { x, y }, 150);
      await expect(message).toContainText(/(Heitto|Rullaheitto) \d+ m|putosi/, { timeout: 15_000 });
      cast = /(Heitto|Rullaheitto) \d+ m/.test(await message.innerText());
      // Pudonnut takaheitto: annetaan ilmoituksen mennä ja nostetaan siima uudelleen.
      if (!cast) await expect(message).toBeHidden({ timeout: 10_000 });
    }
    expect(cast).toBe(true);
    await expect(page.locator('.hud-fly-panel')).toBeHidden();
    errors.check();
  });
});

test('katsojalle puhelimella vain näkymän napit (#280)', async ({
  page,
  browser,
  browserName,
  isMobile,
}) => {
  test.skip(!isMobile || browserName !== 'chromium', 'ajetaan kerran, android-projektissa');
  const errors = watchErrors(page);
  const host = await (await browser.newContext({ baseURL: 'http://localhost:4173' })).newPage();
  await host.goto('/?view=top');
  await host.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(host.getByText('Palvelin päällä')).toBeVisible();
  await host.getByLabel('Nimimerkki').fill('Isäntä');
  await host.getByRole('button', { name: 'Luo uusi huone' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();

  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Moninpeli' }).tap();
  await expect(page.getByText('Palvelin päällä')).toBeVisible();
  await page.getByLabel('Nimimerkki').fill('Katsoja');
  await page.getByLabel('Huonekoodi').fill(code);
  await page.getByRole('button', { name: 'Liity koodilla' }).tap();
  await page.getByRole('button', { name: 'Katson' }).tap();
  await expect(host.locator('.player-state.ok')).toHaveCount(2);
  await host.getByRole('button', { name: 'Aloita kisa' }).click();

  await expect(page.locator('.hud-timer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'KAM' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'VIESTI' })).toBeVisible();
  for (const label of ['HEITÄ', 'VIEHE', 'LUOT', 'KATKO'])
    await expect(page.getByRole('button', { name: label })).toBeHidden();
  await expect(page.locator('.touch-stick')).toBeHidden();
  await expect(page.locator('.hud-tension')).toBeHidden();
  await expect(page.locator('.hud-status')).toContainText('KAM: kalastajan silmin');
  await host.context().close();
  errors.check();
});
