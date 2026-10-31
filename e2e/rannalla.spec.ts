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

  // Maalta ei kalasteta: heittoyritys kertoo sen.
  const view = page.viewportSize()!;
  await page.mouse.click(view.width / 2, view.height * 0.3);
  await expect(page.locator('.hud-message')).toContainText('Maalta ei kalasteta');

  // Rengas mukaan; maihin noustessa kalastaja on vesirajassa, joten kyytiin pääsee heti.
  await page.keyboard.press('Space');
  await expect(situation).toContainText('Hyppää kyytiin');
  await page.keyboard.press('Space');
  // Kyydissä rannan ohje poistuu (tilalle voi tulla opastus ensimmäiseen kalaan).
  await expect
    .poll(async () => ((await situation.isVisible()) ? await situation.innerText() : ''))
    .not.toMatch(/Maissa|Hyppää kyytiin/);
  errors.check();
});
