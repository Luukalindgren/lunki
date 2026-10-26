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
