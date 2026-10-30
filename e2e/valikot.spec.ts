import { expect, test, type Page } from '@playwright/test';
import { SERVER_URL, soloUrl, startSolo, topWeight, watchErrors } from './apu';

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
    await page.goto(soloUrl('pov'));
    await expect.poll(() => focused(page)).toBe('Pelaa');

    // Ensimmäinen nuoli vain näyttää kohdistuksen, seuraava liikkuu.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.screen.kb')).toHaveCount(1);
    await expect.poll(() => focused(page)).toBe('Pelaa');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('Varusteet');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    // Pelaa-alavalikko: Yksinpeli ja Moninpeli.
    await expect(title(page)).toHaveText('Pelaa');
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

    // Esc palaa Pelaa-valikkoon samaan kohtaan, ja paluu yksinpeliin jatkaa samasta napista.
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Pelaa');
    await expect.poll(() => focused(page)).toBe('Yksinpeli');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('Yksinpeli');
    await expect.poll(() => focused(page)).toBe(chosen);

    // Ylös kestosta kiertää alimmalle riville: Aloita kisa.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focused(page)).toBe('Aloita kisa');
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-timer')).toBeVisible();

    // Tauko: Jatka kohdistettuna, nuolet liikkuvat ja Enter avaa asetukset.
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Tauko');
    await expect.poll(() => focused(page)).toBe('Jatka');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('Varusteet');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('Asetukset');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('Asetukset');
    await expect.poll(() => focused(page)).toBe('Takaisin');
    // Alimmalta riviltä alas kiertää ylimpään: HUDin koko.
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('hud-size');
    // Liukusäädin liikkuu myös h- ja l-näppäimillä.
    const slider = page.locator('#hud-size');
    const size = await slider.inputValue();
    await page.keyboard.press('l');
    await expect(slider).not.toHaveValue(size);
    await page.keyboard.press('h');
    await expect(slider).toHaveValue(size);
    // Esc palaa taukoon (ei jatka peliä) samaan nappiin.
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Tauko');
    await expect.poll(() => focused(page)).toBe('Asetukset');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
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
    await page.getByRole('button', { name: 'Pelaa' }).click();
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

  test('vim-näppäimet h/j/k/l liikkuvat nuolten tapaan, mutta eivät tekstikentässä', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'puhelimissa ei näppäimistöä');
    const errors = watchErrors(page);
    await page.goto('/');
    await expect.poll(() => focused(page)).toBe('Pelaa');
    await page.keyboard.press('j');
    await expect(page.locator('.screen.kb')).toHaveCount(1);
    await page.keyboard.press('j');
    await expect.poll(() => focused(page)).toBe('Varusteet');
    await page.keyboard.press('k');
    await expect.poll(() => focused(page)).toBe('Pelaa');
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toBe('Yksinpeli');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('Yksinpeli');

    // Kestoriville: l ja h vaihtavat valinnan.
    await page.keyboard.press('j');
    const duration = page.locator('.choice').first().locator('button.selected');
    const before = await duration.innerText();
    await expect.poll(() => focused(page)).toBe(before);
    await page.keyboard.press('l');
    await expect(duration).not.toHaveText(before);
    await page.keyboard.press('h');
    await expect(duration).toHaveText(before);
    await page.keyboard.press('Escape');

    // Nimimerkkiin kirjoitetaan kirjaimet, eikä kohdistus liiku.
    await page.getByRole('button', { name: 'Moninpeli' }).click();
    const nick = page.getByLabel('Nimimerkki');
    await nick.fill('');
    await nick.focus();
    await page.keyboard.type('hjkl');
    await expect(nick).toHaveValue('hjkl');
    await expect(nick).toBeFocused();
    errors.check();
  });
});

test('ennätyslistan saaliskortti avautuu ja sulkeutuu (#238)', async ({
  page,
  request,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  // Iso kala ja pisin mahdollinen nimi eivät saa vierittää listaa sivuttain.
  const wideWeight = await topWeight(request, 'pike', 11);
  const wide = await request.post(`${SERVER_URL}/records/solo`, {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify({
      species: 'pike',
      weight: wideWeight,
      angler: 'W'.repeat(16),
      difficulty: 'normal',
    }),
  });
  expect(wide.ok()).toBe(true);
  // Oma ennätys listan kärkeen, kalastajan värit mukana.
  const angler = `Kortti-${info.project.name}`.slice(0, 16);
  const res = await request.post(`${SERVER_URL}/records/solo`, {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify({
      species: 'pike',
      weight: wideWeight + 0.001,
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
  await expect(page.locator('li.record-row', { hasText: 'W'.repeat(8) }).first()).toBeVisible();
  const overflow = await page
    .locator('.catch-list.records')
    .evaluateAll((lists) => lists.filter((ol) => ol.scrollWidth > ol.clientWidth + 1).length);
  expect(overflow).toBe(0);
  await page.locator('li.record-row', { hasText: angler }).first().click();
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
  await page.goto(soloUrl()); // oma kupla näkyy vain ylhäältä katsottuna
  await page.getByRole('button', { name: 'Pelaa' }).click();
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
  // Lohkot ovat ympyrän sektoreita: klikkaus lohkon kuvaan.
  await menu.locator('.emote-option').nth(5).locator('.ring-cell').click();
  await expect(menu).toBeHidden();
  errors.check();
});

test('viehepakki: R vaihtaa lokeroa, R pohjassa avaa pikavalikon (#365, #387)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'puhelimissa VIEHE-nappi');
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const box = {
      lures: [{ lure: 'jig', variant: 'g5' }, { lure: 'jig', variant: 'g20' }, { lure: 'spoon' }],
      flies: ['nymph'],
    };
    localStorage.setItem('lunki.tackleBox', JSON.stringify(box));
  });
  await page.goto(soloUrl());
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByRole('button', { name: 'Yksinpeli' }).click();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  const message = page.locator('.hud-message');
  // Lusikka on pakin viimeinen: R kiertää ensimmäiseen.
  await page.keyboard.press('KeyR');
  await expect(message).toContainText('Viehe: Jigi 5 g');
  // Pohjassa pidetty R avaa pikavalikon käytössä oleva viehe valittuna, ja
  // irrotus valitsee osoitetun lohkon (#387).
  const menu = page.locator('.lure-menu');
  await page.keyboard.down('KeyR');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.lure-option')).toHaveCount(3);
  await expect(menu.locator('.lure-option .lure-art')).toHaveCount(3);
  await expect(menu.locator('.lure-caption')).toHaveText('Jigi 5 g');
  await page.keyboard.press('ArrowRight');
  await expect(menu.locator('.lure-caption')).toHaveText('Jigi 20 g');
  await page.keyboard.up('KeyR');
  await expect(menu).toBeHidden();
  await expect(message).toContainText('Viehe: Jigi 20 g');
  await expect(page.locator('.screen')).toBeHidden();
  // M:n napautus jättää kalastustavan valikon auki (#386), uusi napautus sulkee.
  const method = page.locator('.method-menu');
  await page.keyboard.press('KeyM');
  await expect(method).toBeVisible();
  await expect(method.locator('.method-option')).toHaveCount(2);
  await expect(method.locator('.method-caption')).toHaveText('Virveli');
  await page.keyboard.press('KeyM');
  await expect(method).toBeHidden();
  // Pohjassa pidetty M ja irrotus perhon kohdalla: pakin ensimmäinen perho.
  await page.keyboard.down('KeyM');
  await expect(method).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(method.locator('.method-caption')).toHaveText('Perho');
  await page.keyboard.up('KeyM');
  await expect(method).toBeHidden();
  await expect(message).toContainText('Perho: Nymfi');
  errors.check();
});

test('taukovalikko: peruke vaihtuu kesken kisan, ja palaute lähtee tauolta', async ({
  page,
  isMobile,
}) => {
  const errors = watchErrors(page);
  await startSolo(page);
  const pause = async () => {
    if (isMobile) await page.locator('.touch-tools button').first().click();
    else await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Tauko');
  };
  await pause();
  // Kuusi nappia mahtuu reunoineen ruutuun myös puhelimessa.
  const panel = await page.locator('.screen-panel').boundingBox();
  const view = page.viewportSize()!;
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(view.height);

  await page.getByRole('button', { name: 'Varusteet', exact: true }).click();
  await expect(title(page)).toHaveText('Varusteet');
  const leader = page.locator('.choice', { hasText: 'Teräsperuke' });
  await expect(leader.locator('button.selected')).toHaveText('Ei');
  await leader.getByRole('button', { name: 'Kyllä' }).click();
  await expect(page.getByText(/Käytössä: Virveli · .* · peruke$/)).toBeVisible();
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await expect(title(page)).toHaveText('Tauko');
  await page.getByRole('button', { name: 'Jatka' }).click();
  // Ilmoitus kertoo perukkeesta, ei vieheestä.
  await expect(page.locator('.hud-message')).toContainText('Teräsperuke paikallaan');

  // Palaute tauolta: sama lomake, ja Takaisin palaa taukoon.
  await pause();
  await page.getByRole('button', { name: 'Palaute', exact: true }).click();
  await expect(title(page)).toHaveText('Palaute');
  await expect(page.locator('textarea')).toBeVisible();
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await expect(title(page)).toHaveText('Tauko');
  errors.check();
});

test('nimimerkki valitsee profiilin, ja viehepakki näyttää omat saaliit (#415)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('lunki.profiles')) return;
    const box = { lures: [{ lure: 'spoon' }, { lure: 'jig', variant: 'g5' }], flies: ['nymph'] };
    localStorage.setItem('lunki.tackleBox', JSON.stringify(box));
    const fish = (species: string) => ({
      species,
      weight: 1,
      bait: { lure: 'spoon' },
      sky: 'windy',
      timeOfDay: 'evening',
      depth: 1.5,
      x: 0,
      y: 0,
      at: 1,
    });
    localStorage.setItem(
      'lunki.journal',
      JSON.stringify([fish('pike'), fish('pike'), fish('perch')]),
    );
  });
  await page.goto('/');
  const openBox = async () => {
    await page.getByRole('button', { name: 'Varusteet' }).click();
    await page.locator('.summary-row', { hasText: 'Viehepakki' }).getByRole('button').click();
  };
  // Ensimmäinen nimimerkki ottaa nimettömänä kertyneet tiedot omikseen.
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByLabel('Nimimerkki').fill('Profiili');
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await openBox();
  const slots = page.locator('.box-slot:not(.empty)');
  await expect(slots).toHaveCount(2);
  await expect(slots.first().locator('.box-slot-catch')).toHaveText('3 kalaa');
  await expect(slots.nth(1).locator('.box-slot-catch')).toHaveCount(0);
  await expect(page.locator('.box-catches')).toHaveText(
    'Sinun saaliisi tällä: 3 kalaa (hauki 2, ahven 1) · parhaiten kesällä tuulella illalla, 1–2 m syvyydeltä',
  );
  // Uusi nimimerkki aloittaa alusta, ja vanha tuo tiedot takaisin.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByLabel('Nimimerkki').fill('Toinen');
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await openBox();
  await expect(page.locator('.box-slot-catch')).toHaveCount(0);
  await expect(page.locator('.box-slot:not(.empty)')).not.toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByLabel('Nimimerkki').fill('profiili');
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await openBox();
  await expect(slots).toHaveCount(2);
  await expect(slots.first().locator('.box-slot-catch')).toHaveText('3 kalaa');
  errors.check();
});

test('latausruutu näkyy pelin koodin latautuessa ja poistuu valikon tullessa', async ({ page }) => {
  const errors = watchErrors(page);
  // Hidas yhteys: pelin koodi pidetään matkalla, kunnes latausruutu on tarkistettu.
  // (Kiinteä viive ei riitä: kuormitetussa CI:ssä tarkistukset ehtivät kestää pidempään.)
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/assets/*.js', async (route) => {
    await held;
    await route.continue();
  });
  // Ei odoteta load-tapahtumaa: se tulee vasta pelin koodin jälkeen.
  await page.goto('/', { waitUntil: 'commit' });
  const boot = page.locator('#boot-loader');
  await expect(boot).toBeVisible();
  await expect(boot).toContainText('Ladataan');
  await expect(boot.locator('.loader-art')).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();
  await expect(boot).toHaveCount(0);
  errors.check();
});

test('valikkoruudut mahtuvat reunoineen ruutuun', async ({ page }) => {
  const errors = watchErrors(page);
  const inside = () =>
    page.locator('.screen-panel').evaluate((panel) => {
      const r = panel.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
  await page.goto('/');
  await expect(page.locator('.start-panel')).toBeVisible();
  expect(await inside()).toBe(true);
  for (const name of ['Pelaa', 'Järvikartta', 'Ennätykset', 'Ohjeet', 'Tietoa ja palaute']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.screen-panel h2').first()).toBeVisible();
    expect(await inside(), name).toBe(true);
    await page.goto('/');
  }
  errors.check();
});

test('Ohjeet: osiot päävalikosta, ohjaus laitteen mukaan (#401)', async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ohjeet', exact: true }).click();
  await expect(page.locator('.screen-panel h2').first()).toHaveText('Ohjeet');
  await expect(page.locator('.manual h3').first()).toHaveText('Kelluntarengas');
  await page.getByRole('button', { name: 'Perho', exact: true }).click();
  await expect(page.locator('.manual h3').first()).toHaveText('Perhoheitto');
  await expect(page.locator('.manual')).toContainText(
    isMobile ? 'SIIMA pohjassa = siimakäsi' : 'Hiiren vasen/välilyönti pohjassa = siimakäsi',
  );
  await page.getByRole('button', { name: 'Takaisin' }).click();
  await expect(page.locator('.start-panel')).toBeVisible();
  errors.check();
});
