import { expect, test } from '@playwright/test';
import { SEED, raceRunning, watchErrors } from './apu';

/**
 * Rantautuminen (#457): yksinpeli alkaa itärannan tuntumasta selkä rantaan.
 * Selkä edellä potkiminen (S) vie maihin, maalta ei kalasteta, välilyönti ottaa
 * renkaan ja vesirajassa hyppää kyytiin. Kisa aloitetaan suoraan osoitteesta
 * (?difficulty&start), ylhäältä katsottuna, tyynellä säällä.
 */
test('rannalla: maihin, rengas mukaan ja takaisin kyytiin', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.goto(
    `/?view=top&seed=${SEED}&difficulty=easy&weather=calm&minutes=10&start=1029.6,-410.2`,
  );
  await raceRunning(page);
  const situation = page.locator('.hud-situation');

  // Selkä edellä rantaan ja maihin: S pohjassa, kunnes kalastaja on maissa.
  await page.keyboard.down('KeyS');
  await expect(situation).toContainText('Maissa', { timeout: 30_000 });
  await page.keyboard.up('KeyS');
  // Maalla kalastuksen paneelit (tilapaneeli, kireysmittari, luotaimet) ovat piilossa.
  const status = page.locator('.hud-status');
  await expect(status).toBeHidden();
  await expect(page.locator('.hud-tension')).toBeHidden();

  // Maalta ei kalasteta: heittoyritys kertoo sen.
  const view = page.viewportSize()!;
  await page.mouse.click(view.width / 2, view.height * 0.3);
  const message = page.locator('.hud-message');
  await expect(message).toContainText('Maalta ei kalasteta');
  await expect(message).toBeHidden();
  // Välilyönti ottaa renkaan ja hyppää kyytiin: se ei ole heittoyritys (#464).
  await page.evaluate(() => {
    const w = window as unknown as { noFishing: number };
    w.noFishing = 0;
    const el = document.querySelector<HTMLElement>('.hud-message')!;
    new MutationObserver(() => {
      if (!el.hidden && el.textContent?.includes('Maalta ei kalasteta')) w.noFishing++;
    }).observe(el, { subtree: true, childList: true, characterData: true });
  });

  // Rengas mukaan; maihin noustessa kalastaja on vesirajassa, joten kyytiin pääsee heti.
  await page.keyboard.press('Space');
  await expect(situation).toContainText('Hyppää kyytiin');
  await page.keyboard.press('Space');
  // Kyydissä rannan ohje poistuu (tilalle voi tulla opastus ensimmäiseen kalaan).
  await expect
    .poll(async () => ((await situation.isVisible()) ? await situation.innerText() : ''))
    .not.toMatch(/Maissa|Hyppää kyytiin/);
  // Vedessä kalastuksen paneelit palaavat.
  await expect(status).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { noFishing: number }).noFishing)).toBe(0);
  errors.check();
});

/**
 * Täyttökisa (#458): kisa alkaa rannalta tyhjän renkaan ja pumpun ääressä.
 * Välilyönti pumppaa vasemman kyljen täyteen, ja tilanneohjeen nuolisarja
 * siirtää letkun oikeaan kylkeen.
 */
test('täyttökisa: pumppaus ja letkun siirto', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.goto(
    `/?view=top&seed=${SEED}&difficulty=easy&weather=calm&minutes=10&inflate&start=1029.6,-410.2`,
  );
  await raceRunning(page);
  const situation = page.locator('.hud-situation');
  await expect(situation).toContainText('Pumppaa');
  await expect(situation).toContainText('vasen puolisko');

  // Pumppaa, kunnes puolisko on täynnä ja ohje pyytää siirtämään letkun.
  // Liian tiheät vedot ovat vajaita, joten painallusten määrä vaihtelee.
  for (let i = 0; i < 3000; i++) {
    if ((await situation.innerText()).includes('Siirrä letku')) break;
    await page.keyboard.press('Space');
  }
  await expect(situation).toContainText('Siirrä letku: oikea puolisko');

  const keys: Record<string, string> = { '↑': 'KeyW', '↓': 'KeyS', '←': 'KeyA', '→': 'KeyD' };
  const arrows = (await situation.innerText()).split('Nuolet ')[1]!.split(' ');
  // Jokainen osuttu nuoli kuitataan ohjeessa ennen seuraavaa painallusta.
  for (const [i, a] of arrows.entries()) {
    await page.keyboard.press(keys[a]!);
    if (i < arrows.length - 1)
      await expect(situation).toContainText(
        Array(i + 1)
          .fill('✓')
          .join(' '),
      );
  }
  await expect(situation).toContainText('oikea puolisko 0 %');
  errors.check();
});

/**
 * Veneen vesillelasku täyttökisassa (#458): vene on rannalla vettä täynnä.
 * Välilyönti äyskäröi keulan tyhjäksi, ja nuolisarja siirtää perään.
 */
test('täyttökisa veneellä: äyskäröinti ja siirto perään', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem('lunki.craft', 'boat'));
  await page.goto(
    `/?view=top&seed=${SEED}&difficulty=easy&weather=calm&minutes=10&inflate&start=1029.6,-410.2`,
  );
  await raceRunning(page);
  const situation = page.locator('.hud-situation');
  await expect(situation).toContainText('Äyskäröi');
  await expect(situation).toContainText('keulassa');

  // Äyskäröi, kunnes keula on tyhjä ja ohje pyytää siirtymään perään.
  for (let i = 0; i < 3000; i++) {
    if ((await situation.innerText()).includes('Siirry')) break;
    await page.keyboard.press('Space');
  }
  await expect(situation).toContainText('Siirry perään');

  const keys: Record<string, string> = { '↑': 'KeyW', '↓': 'KeyS', '←': 'KeyA', '→': 'KeyD' };
  const arrows = (await situation.innerText()).split('Nuolet ')[1]!.split(' ');
  for (const [i, a] of arrows.entries()) {
    await page.keyboard.press(keys[a]!);
    if (i < arrows.length - 1)
      await expect(situation).toContainText(
        Array(i + 1)
          .fill('✓')
          .join(' '),
      );
  }
  await expect(situation).toContainText('vettä perässä 100 %');
  errors.check();
});
