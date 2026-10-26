import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/** Kohdistetun elementin teksti (napit) tai tunniste. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    return e?.textContent?.trim() || e?.getAttribute('aria-label') || e?.tagName || '';
  });

/** Näkymän otsikko. */
const title = (page: Page) => page.locator('.screen-panel h2').first();

test.describe('valikot näppäimistöllä (#237)', () => {
  test('päävalikosta kisaan, taukovalikko ja takaisin pelkillä näppäimillä', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'puhelimissa ei näppäimistöä');
    const errors = watchErrors(page);
    await page.goto('/');
    await expect.poll(() => focused(page)).toBe('Yksinpeli');

    // Ensimmäinen nuoli vain näyttää kohdistuksen, seuraava liikkuu.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.screen.kb')).toHaveCount(1);
    await expect.poll(() => focused(page)).toBe('Yksinpeli');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('Moninpeli');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('Yksinpeli');
    await expect.poll(() => focused(page)).toBe('Aloita kisa');

    // Rivit kiertävät: alhaalta ylimmälle riville (kesto), ja oikea vaihtaa valinnan.
    await page.keyboard.press('ArrowDown');
    const duration = page.locator('.choice').first().locator('button.selected');
    const before = await duration.innerText();
    await expect.poll(() => focused(page)).toBe(before);
    await page.keyboard.press('ArrowRight');
    await expect(duration).not.toHaveText(before);
    const chosen = await duration.innerText();
    await expect.poll(() => focused(page)).toBe(chosen);

    // Esc palaa päävalikkoon samaan kohtaan, ja paluu yksinpeliin jatkaa samasta napista.
    await page.keyboard.press('Escape');
    await expect.poll(() => focused(page)).toBe('Yksinpeli');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('Yksinpeli');
    await expect.poll(() => focused(page)).toBe(chosen);

    // Ylös kestosta kiertää alimmalle riville: Aloita kisa.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focused(page)).toBe('Aloita kisa');
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-timer')).toBeVisible();

    // Tauko: Jatka kohdistettuna, nuolet liikkuvat ja Enter jatkaa.
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Tauko');
    await expect.poll(() => focused(page)).toBe('Jatka');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('hud-size');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('Jatka');
    // Välilyönti valikossa ei heitä taustalla.
    await page.keyboard.press('Space');
    await expect(page.locator('.screen')).toBeHidden();
    await expect(page.locator('.hud-power')).toBeHidden();

    // Backspace jatkaa myös tauolta.
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Tauko');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.screen')).toBeHidden();
    errors.check();
  });

  test('järvikartta: nuolet panoroivat, +/− zoomaa ja Enter valitsee aloituspaikan', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'puhelimissa ei näppäimistöä');
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yksinpeli' }).click();
    await page.getByRole('button', { name: 'Valitse kartalta' }).click();
    const map = page.locator('canvas.lake-map-canvas');
    await map.focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    // Panorointi ja takaisin keskelle järveä.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    // Keskeltä valittu kohta vedessä: vahvistus käyttöön.
    await expect(page.getByRole('button', { name: 'Valitse tämä' })).toBeEnabled();
    await expect(page.locator('.lake-map-info')).toContainText('Syvyys');
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Yksinpeli');
    errors.check();
  });
});

test('ennätyslistan saaliskortti avautuu ja sulkeutuu (#238)', async ({
  page,
  request,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  // Oma ennätys yksinpelin listalle, kalastajan värit mukana.
  const angler = `Kortti-${info.project.name}`.slice(0, 16);
  const res = await request.post('http://localhost:2567/records/solo', {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify({
      species: 'pike',
      weight: 3 + info.workerIndex / 100,
      angler,
      difficulty: 'normal',
      timeOfDay: 'evening',
      appearance: { tube: 0xf6d04d, fins: 0x1c232b, shirt: 0x2f9e8f, line: 0xc3cbd2 },
    }),
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ennätykset' }).click();
  await page.locator('.choice').first().getByRole('button', { name: 'Yksinpeli' }).click();
  await page.locator('li.record-row', { hasText: angler }).click();
  const open = page.getByRole('button', { name: 'Näytä saaliskortti' });
  await open.click();
  const modal = page.locator('.screen-modal');
  await expect(modal.locator('canvas.weigh-card')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Tallenna kuva' })).toBeVisible();
  if (isMobile) await modal.getByRole('button', { name: 'Takaisin' }).click();
  else {
    await page.keyboard.press('Escape');
    // Kohdistus palaa listaan samaan kohtaan.
    await expect(open).toBeFocused();
  }
  await expect(modal).toHaveCount(0);
  await expect(title(page)).toHaveText('Lunkinjärven ennätykset');
  errors.check();
});

test('käsimerkit: G avaa valikon, numero tekee eleen ja Esc sulkee tauotta (#228)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'puhelimissa ELE-nappi, ks. kosketus.spec');
  const errors = watchErrors(page);
  await page.goto('/?view=top'); // oma kupla näkyy vain ylhäältä katsottuna
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  const menu = page.locator('.emote-menu');
  // Puheäänet (#229) ladataan vasta, kun valikko avataan ensimmäisen kerran.
  const voice = page.waitForResponse(/audio\/puhe\/[a-zA-Z]+-\d\.mp3$/);
  await page.keyboard.press('KeyG');
  await expect(menu).toBeVisible();
  expect((await voice).ok()).toBe(true);
  await expect(menu.locator('.emote-option')).toHaveCount(6);
  // Esc sulkee valikon eikä avaa taukoa.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.screen')).toBeHidden();
  // Nuolet ja Enter valitsevat; oma kupla näkyy ylhäältä katsottuna.
  await page.keyboard.press('KeyG');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(menu.locator('.emote-caption')).toHaveText('Peukku');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(page.locator('.speech-bubble')).toBeVisible();
  await expect(page.locator('.speech-bubble canvas.emote-icon')).toHaveCount(1);
  // Hiirellä: klikkaus valitsee.
  await page.keyboard.press('KeyG');
  await expect(menu).toBeVisible();
  await menu.locator('.emote-option').nth(5).click();
  await expect(menu).toBeHidden();
  errors.check();
});
