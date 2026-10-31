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
  await host.getByRole('button', { name: 'Pelaa' }).click();
  await host.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(host.getByText('Palvelin päällä')).toBeVisible();
  await host.getByLabel('Nimimerkki').fill('Soutaja');
  await host.getByRole('button', { name: 'Luo uusi huone' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();
  // Tyyni sää: tuulivaroitus ei peitä ankkurin ilmoituksia.
  await host.getByRole('button', { name: 'Aina tyyni' }).click();
  await host.getByRole('button', { name: 'Oma vene' }).click();
  await expect(host.locator('.boat-crew', { hasText: 'Vene 1' })).toContainText('soutaja');

  await guest.goto('/?view=top');
  await guest.getByRole('button', { name: 'Pelaa' }).click();
  await guest.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(guest.getByText('Palvelin päällä')).toBeVisible();
  await guest.getByLabel('Nimimerkki').fill('Kyyti');
  await guest.getByLabel('Huonekoodi').fill(code);
  await guest.getByRole('button', { name: 'Liity koodilla' }).click();
  await expect(guest.locator('.room-code')).toHaveText(code);
  // Vieras on ensin renkaalla, omana rivinään veneen ulkopuolella.
  // (hasText ei erota kirjainkokoa: "Kyyti" löytyisi myös napista "Liity kyytiin".)
  await expect(
    guest.locator('.player-list li:not(.boat-crew)', { hasText: 'Kyyti (sinä)' }),
  ).toContainText('kelluntarengas');
  await guest
    .locator('.boat-crew', { hasText: 'Vene 1' })
    .getByRole('button', { name: 'Liity kyytiin' })
    .click();
  const crew = host.locator('.boat-crew', { hasText: 'Vene 1' });
  await expect(crew).toContainText('Kyyti');
  await expect(crew).toContainText('perässä');
  await expect(crew).toContainText('joukkue · 2/3');
  // Paikanvaihto aulassa (#357): vieras pyytää, isäntä vastaa samalla napilla.
  const row = (p: Page, name: string) => p.locator('.boat-crew li', { hasText: name });
  await row(guest, 'Soutaja').getByRole('button', { name: 'Vaihda paikkaa' }).click();
  await expect(row(host, 'Kyyti')).toContainText('haluaa vaihtaa kanssasi');
  await row(host, 'Kyyti').getByRole('button', { name: 'Vaihda paikkaa' }).click();
  await expect(row(host, 'Kyyti')).toContainText('soutaja');
  await expect(row(host, 'Soutaja (sinä)')).toContainText('perässä');
  await guest.getByRole('button', { name: 'Valmis!' }).click();

  await host.getByRole('button', { name: 'Aloita kisa' }).click();
  // Lähtölaskennan jälkeen kello käy (lähtölaskennan aikana syötteet eivät vaikuta).
  // Odotetaan kisan kelloa alle 15:00: ennen kisan alkua HUDissa voi olla
  // valikon taustakohtauksen aika.
  for (const p of [host, guest])
    await expect(p.locator('.hud-timer')).toHaveText(/^14:\d\d$/, { timeout: 30_000 });
  // Kisassa paikka vaihtuu takaisin T:llä: pyyntö näkyy toiselle tilanneohjeena.
  await guest.keyboard.press('KeyT');
  await expect(host.locator('.hud-situation')).toContainText(
    'Kyyti haluaa vaihtaa paikkaa kanssasi',
  );
  await host.keyboard.press('KeyT');
  await expect(guest.locator('.hud-help')).toContainText('Kyydissä');
  await expect(host.locator('.hud-help')).toContainText('souda');
  // Kyydissä ei voi soutaa: tilanneohje kertoo, että vain soutaja soutaa.
  await guest.keyboard.down('KeyS');
  await expect(guest.locator('.hud-situation')).toContainText('Vain soutaja soutaa');
  await guest.keyboard.up('KeyS');
  // Ankkurin laskee vain soutaja (#355). Kisan alun ilmoitus menee ensin ohi:
  // tärkeämmän ilmoituksen aikana vinkki jäisi jonoon.
  await expect(guest.locator('.hud-message')).toBeHidden();
  await guest.keyboard.press('KeyN');
  await expect(guest.locator('.hud-message')).toHaveText('Vain soutaja laskee ankkurin');
  await expect(host.locator('.hud-message')).toBeHidden();
  await host.keyboard.press('KeyN');
  await expect(host.locator('.hud-message')).toContainText('Ankkuri pohjassa', {
    timeout: 15_000,
  });
  // Tulostaulussa vene on yksi rivi.
  await expect(host.getByText('Vene 1').first()).toBeVisible();

  hostErrors.check();
  guestErrors.check();
  await guest.context().close();
});

/**
 * Täyttökisa veneellä (#458): vene on rannalla vettä täynnä, ja kyytiläinen
 * äyskäröi perää. Hänen kauhallisensa näkyvät soutajan ohjeessa veneen
 * vedessä, koska palvelin laskee ne soutajan veneeseen.
 */
test('vene täyttökisassa: kyytiläinenkin äyskäröi', async ({ page: host, browser }) => {
  test.setTimeout(120_000);
  const hostErrors = watchErrors(host);
  const guest: Page = await (await browser.newContext()).newPage();
  const guestErrors = watchErrors(guest);

  await host.goto('/?view=top');
  await host.getByRole('button', { name: 'Pelaa' }).click();
  await host.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(host.getByText('Palvelin päällä')).toBeVisible();
  await host.getByLabel('Nimimerkki').fill('Soutaja');
  await host.getByRole('button', { name: 'Luo uusi huone' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();
  await host.getByRole('button', { name: 'Aina tyyni' }).click();
  await host.getByRole('button', { name: 'Täyttökisa rannalta' }).click();
  await host.getByRole('button', { name: 'Oma vene' }).click();
  await expect(host.locator('.boat-crew', { hasText: 'Vene 1' })).toContainText('soutaja');

  await guest.goto('/?view=top');
  await guest.getByRole('button', { name: 'Pelaa' }).click();
  await guest.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(guest.getByText('Palvelin päällä')).toBeVisible();
  await guest.getByLabel('Nimimerkki').fill('Kyyti');
  await guest.getByLabel('Huonekoodi').fill(code);
  await guest.getByRole('button', { name: 'Liity koodilla' }).click();
  await expect(guest.locator('.room-code')).toHaveText(code);
  await guest
    .locator('.boat-crew', { hasText: 'Vene 1' })
    .getByRole('button', { name: 'Liity kyytiin' })
    .click();
  await expect(host.locator('.boat-crew', { hasText: 'Vene 1' })).toContainText('perässä');
  await guest.getByRole('button', { name: 'Valmis!' }).click();
  await host.getByRole('button', { name: 'Aloita kisa' }).click();
  for (const p of [host, guest])
    await expect(p.locator('.hud-timer')).toHaveText(/^14:\d\d$/, { timeout: 30_000 });

  const hostHint = host.locator('.hud-situation');
  const guestHint = guest.locator('.hud-situation');
  await expect(hostHint).toContainText('vettä keulassa 100 % (koko veneessä 100 %)');
  await expect(guestHint).toContainText('vettä perässä 100 %');
  // Kyytiläisen kauhalliset vähentävät perän vettä soutajankin veneessä.
  for (let i = 0; i < 400; i++) {
    if (!(await hostHint.innerText()).includes('koko veneessä 100 %')) break;
    await guest.keyboard.press('Space');
  }
  await expect(hostHint).toContainText('vettä keulassa 100 %');
  await expect(hostHint).not.toContainText('koko veneessä 100 %');
  await expect(guestHint).not.toContainText('vettä perässä 100 %');
  hostErrors.check();
  guestErrors.check();
});
