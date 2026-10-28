import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/**
 * Vene kulkupelinä (#263): isäntä valitsee aulassa oman veneen, vieras on
 * ensin renkaalla ja nousee sitten isännän kyytiin perään. Venekunta näkyy
 * aulassa yhtenä joukkueena. Kisassa vieras on kyydissä: soutaminen ei
 * onnistu, ja tilanneohje kertoo sen. Ajetaan moninpeli-projektissa
 * (playwright.config.ts).
 */
test('vene: kaksi kalastajaa samassa veneessä', async ({ page: host, browser }) => {
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
  await host.getByRole('button', { name: 'Oma vene' }).click();
  await expect(host.locator('.boat-crew', { hasText: 'Vene 1' })).toContainText('soutaja');

  await guest.goto('/?view=top');
  await guest.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(guest.getByText('Palvelin päällä')).toBeVisible();
  await guest.getByLabel('Nimimerkki').fill('Kyyti');
  await guest.getByLabel('Huonekoodi').fill(code);
  await guest.getByRole('button', { name: 'Liity koodilla' }).click();
  await expect(guest.locator('.room-code')).toHaveText(code);
  // Vieras on ensin renkaalla, omana rivinään veneen ulkopuolella.
  await expect(guest.locator('.player-list li', { hasText: 'Kyyti' }).first()).toContainText(
    'kelluntarengas',
  );
  await guest
    .locator('.boat-crew', { hasText: 'Vene 1' })
    .getByRole('button', { name: 'Liity kyytiin' })
    .click();
  const crew = host.locator('.boat-crew', { hasText: 'Vene 1' });
  await expect(crew).toContainText('Kyyti');
  await expect(crew).toContainText('perässä');
  await expect(crew).toContainText('joukkue · 2/3');
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
