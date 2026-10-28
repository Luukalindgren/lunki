import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/**
 * Venekisa (#263): isäntä valitsee aulassa veneet, vieras siirtyy isännän
 * veneeseen perään, ja kisassa vieras on kyydissä: soutaminen ei onnistu,
 * ja tilanneohje kertoo sen. Ajetaan moninpeli-projektissa (playwright.config.ts).
 */
test('venekisa: kaksi kalastajaa samassa veneessä', async ({ page: host, browser }) => {
  test.setTimeout(120_000);
  const hostErrors = watchErrors(host);
  const guest: Page = await (await browser.newContext()).newPage();
  const guestErrors = watchErrors(guest);

  await host.goto('/?view=top');
  await host.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(host.getByText('Palvelin päällä')).toBeVisible();
  await host.getByLabel('Nimimerkki').fill('Soutaja');
  await host.getByRole('button', { name: 'Luo uusi huone' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();
  await host.getByRole('button', { name: 'Veneet joukkueina' }).click();

  await guest.goto('/?view=top');
  await guest.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(guest.getByText('Palvelin päällä')).toBeVisible();
  await guest.getByLabel('Nimimerkki').fill('Kyyti');
  await guest.getByLabel('Huonekoodi').fill(code);
  await guest.getByRole('button', { name: 'Liity koodilla' }).click();
  await expect(guest.locator('.room-code')).toHaveText(code);
  // Kumpikin omassa veneessään, kunnes vieras siirtyy isännän veneeseen.
  await expect(guest.locator('.boat-crew', { hasText: 'Vene 2' })).toBeVisible();
  await guest
    .locator('.boat-crew', { hasText: 'Vene 1' })
    .getByRole('button', { name: 'Siirry tähän veneeseen' })
    .click();
  await expect(host.locator('.boat-crew', { hasText: 'Vene 2' })).toHaveCount(0);
  await expect(host.locator('.player-list')).toContainText('perässä');
  await guest.getByRole('button', { name: 'Valmis!' }).click();

  await host.getByRole('button', { name: 'Aloita kisa' }).click();
  for (const p of [host, guest]) await expect(p.locator('.hud-timer')).toBeVisible();
  await expect
    .poll(() => guest.locator('.hud-timer').innerText(), { timeout: 20_000 })
    .not.toBe('10:00');
  // Kyydissä ei voi soutaa: tilanneohje kertoo, että vain soutaja soutaa.
  await guest.keyboard.down('KeyS');
  await expect(guest.getByText('Vain soutaja soutaa')).toBeVisible();
  await guest.keyboard.up('KeyS');
  // Tulostaulussa vene on yksi rivi.
  await expect(host.getByText('Vene 1').first()).toBeVisible();

  hostErrors.check();
  guestErrors.check();
  await guest.context().close();
});
