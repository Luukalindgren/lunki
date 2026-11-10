import {
  devices,
  expect,
  firefox,
  test,
  webkit,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { FIREFOX_WEBGL } from '../playwright.config';
import { watchErrors } from './apu';

/**
 * Sama huone kolmella selainmoottorilla: Chromium luo huoneen, Firefox ja
 * iPhone-Safari (WebKit) liittyvät koodilla. iPhone pelaa englanniksi, muut
 * suomeksi. Ajetaan omassa moninpeli-projektissaan (playwright.config.ts),
 * koska testi käynnistää muut selaimet itse.
 */

/** Liittyjän napit ja tekstit kielen mukaan. */
const GUEST_TEXT = {
  fi: {
    play: 'Pelaa',
    multiplayer: 'Moninpeli',
    serverOk: 'Palvelin päällä',
    nickname: 'Nimimerkki',
    roomCode: 'Huonekoodi',
    join: 'Liity koodilla',
    ready: 'Valmis!',
  },
  en: {
    play: 'Play',
    multiplayer: 'Multiplayer',
    serverOk: 'Server is up',
    nickname: 'Nickname',
    roomCode: 'Room code',
    join: 'Join with a code',
    ready: 'Ready!',
  },
};
test('moninpeli: Chromium, Firefox ja iPhone samassa huoneessa', async ({ page: host }) => {
  test.setTimeout(180_000);
  const others: Browser[] = [];
  try {
    const pages: [string, ReturnType<typeof watchErrors>][] = [['chromium', watchErrors(host)]];
    const join = async (
      launcher: typeof firefox,
      options: BrowserContextOptions,
      name: string,
    ): Promise<Page> => {
      // Ei chromium-projektin käynnistysvalitsimia (SwiftShader) muille selaimille.
      const browser = await launcher.launch({
        args: [],
        ...(launcher === firefox ? FIREFOX_WEBGL : {}),
      });
      others.push(browser);
      const ctx = await browser.newContext({ ...options, baseURL: 'http://localhost:4173' });
      const page = await ctx.newPage();
      pages.push([name, watchErrors(page)]);
      return page;
    };

    await host.goto('/?view=top');
    await host.getByRole('button', { name: 'Pelaa' }).click();
    await host.getByRole('button', { name: 'Moninpeli' }).click();
    await expect(host.getByText('Palvelin päällä')).toBeVisible();
    await host.getByLabel('Nimimerkki').fill('Kromi');
    await host.getByRole('button', { name: 'Luo uusi huone' }).click();
    const code = (await host.locator('.room-code').innerText()).trim();
    expect(code).toMatch(/^LUNKI-[A-Z0-9]{4}$/);

    let guests: [Page, boolean][];
    try {
      guests = [
        [await join(firefox, { ...devices['Desktop Firefox'], locale: 'fi-FI' }, 'firefox'), false],
        [await join(webkit, { ...devices['iPhone 15'], locale: 'en-US' }, 'iphone'), true],
      ];
    } catch (e) {
      // CI asentaa kaikki selaimet: siellä puuttuva selain on virhe.
      if (process.env.CI) throw e;
      test.skip(true, `Firefox tai WebKit puuttuu tältä koneelta: ${String(e).split('\n')[0]}`);
      return;
    }
    for (const [[guest, touch], name] of guests.map((g, i) => [g, `Vieras${i + 1}`] as const)) {
      const text = GUEST_TEXT[touch ? 'en' : 'fi'];
      // Tarkka nimi: englanniksi Play osuisi myös How to play -nappiin.
      const press = (label: string) =>
        touch
          ? guest.getByRole('button', { name: label, exact: true }).tap()
          : guest.getByRole('button', { name: label, exact: true }).click();
      await guest.goto('/?view=top');
      await press(text.play);
      await press(text.multiplayer);
      await expect(guest.getByText(text.serverOk)).toBeVisible();
      await guest.getByLabel(text.nickname).fill(name);
      await guest.getByLabel(text.roomCode).fill(code.toLowerCase());
      await press(text.join);
      await expect(guest.locator('.room-code')).toHaveText(code);
      await press(text.ready);
    }
    await expect(host.locator('.player-list li')).toHaveCount(3);

    // Omat värit aulasta: värin vaihto päivittää aulan taustalla, ja Takaisin
    // ja Esc palaavat aulaan uusimmalla tilalla (jäi jumiin värinäkymään).
    const colors = host.locator('.screen-panel .summary-button');
    await colors.click();
    const swatch = host
      .locator('.swatches')
      .first()
      .locator('button.swatch:not(.selected)')
      .first();
    const color = await swatch.evaluate((b) => (b as HTMLElement).style.background);
    await swatch.click();
    await host.getByRole('button', { name: 'Takaisin', exact: true }).click();
    await expect(host.locator('.room-code')).toHaveText(code);
    await expect
      .poll(() =>
        host
          .locator('.player-list li .player-color')
          .first()
          .evaluate((e) => (e as HTMLElement).style.background),
      )
      .toBe(color);
    await colors.click();
    await expect(host.locator('[data-screen="lobby-colors"]')).toBeVisible();
    await host.keyboard.press('Escape');
    await expect(host.locator('.room-code')).toHaveText(code);

    // Chat kulkee selaimesta toiseen.
    const [ff, ios] = [guests[0]![0], guests[1]![0]];
    await ff.getByPlaceholder('Kirjoita viesti muille…').fill('terve kaikki');
    await ff.getByPlaceholder('Kirjoita viesti muille…').press('Enter');
    await expect(host.locator('.chat-log')).toContainText('terve kaikki');
    await expect(ios.locator('.chat-log')).toContainText('terve kaikki');

    await host.getByRole('button', { name: 'Aloita kisa' }).click();
    for (const p of [host, ff, ios]) await expect(p.locator('.hud-timer')).toBeVisible();
    // Kisan kello käy kaikilla: lähtölaskennan jälkeen alle 15:00. Pelkkä
    // muutos ei riitä, sillä ennen kisaa HUDissa voi olla valikon taustan aika.
    for (const p of [host, ff, ios])
      await expect(p.locator('.hud-timer')).toHaveText(/^14:\d\d$/, { timeout: 30_000 });

    // Käsimerkki ja kisan aikainen chat kulkevat muille kuplina (#228).
    await host.keyboard.press('KeyG');
    await expect(host.locator('.emote-menu')).toBeVisible();
    await host.keyboard.press('Digit1');
    await expect(host.locator('.emote-menu')).toBeHidden();
    for (const p of [ff, ios])
      await expect(p.locator('.name-tags .speech-bubble canvas.emote-icon')).toHaveCount(1);
    // Nimilaput ja kuplat piirtyvät HUDin alle, eivät nappien päälle (#277).
    for (const p of [host, ff, ios])
      expect(
        await p.evaluate(() => {
          const tags = document.querySelector('.name-tags')!;
          const hud = document.querySelector('.hud')!;
          return Boolean(tags.compareDocumentPosition(hud) & Node.DOCUMENT_POSITION_FOLLOWING);
        }),
      ).toBe(true);

    for (const [name, errors] of pages) {
      test.info().annotations.push({ type: name, description: errors.errors.join(' | ') || 'ok' });
      errors.check();
    }
  } finally {
    await Promise.all(others.map((b) => b.close()));
  }
});

test('täysi aula: katsoja odottaa paikkaa ja pääsee kalastamaan rajan noustessa', async ({
  page: host,
  browser,
}) => {
  test.setTimeout(120_000);
  const errors = [watchErrors(host)];
  const lobby = async (page: Page, name: string, code?: string) => {
    await page.goto('/?view=top');
    await page.getByRole('button', { name: 'Pelaa' }).click();
    await page.getByRole('button', { name: 'Moninpeli' }).click();
    await expect(page.getByText('Palvelin päällä')).toBeVisible();
    await page.getByLabel('Nimimerkki').fill(name);
    if (code) {
      await page.getByLabel('Huonekoodi').fill(code.toLowerCase());
      await page.getByRole('button', { name: 'Liity koodilla', exact: true }).click();
      await expect(page.locator('.room-code')).toHaveText(code);
    } else await page.getByRole('button', { name: 'Luo uusi huone' }).click();
  };
  const row = (page: Page, label: string) =>
    page.locator('.choice', { has: page.locator('.choice-label', { hasText: label }) });

  await lobby(host, 'Isäntä');
  const code = (await host.locator('.room-code').innerText()).trim();
  await row(host, 'Pelaajia enintään').getByRole('button', { name: '2', exact: true }).click();
  const [second, third] = await Promise.all(
    [0, 1].map(async () =>
      (await browser.newContext({ locale: 'fi-FI', baseURL: 'http://localhost:4173' })).newPage(),
    ),
  );
  errors.push(watchErrors(second!), watchErrors(third!));
  await lobby(second!, 'Toinen', code);
  await lobby(third!, 'Kolmas', code);
  // Isäntä näkee liittyjän ja jonottajien määrän heti otsikossa (#516).
  await expect(host.locator('.lobby-event')).toContainText('Kolmas liittyi aulaan');
  await expect(
    host.locator('.choice-label', { hasText: 'Pelaajat 2/2 · 1 odottaa paikkaa' }),
  ).toBeVisible();
  await expect(host.locator('.lobby-full')).toBeVisible();
  // Jonottajan rivillä "odottaa paikkaa", ei "katsoja" (#568).
  await expect(host.locator('.player-state.seat-wait')).toHaveText('odottaa paikkaa');

  // Kolmas tuli täyteen aulaan: katsoja, eikä Kalastan-nappi lupaa paikkaa (#514).
  const nextRace = row(third!, 'Seuraava kisa');
  await expect(nextRace.locator('button.selected')).toHaveText('Katson');
  await expect(nextRace.getByRole('button', { name: 'Kalastan' })).toBeDisabled();
  await expect(third!.getByText(/Kalastajapaikat ovat täynnä/)).toBeVisible();
  // Jo valitun Katson-napin painallus ei poista paikkajonosta.
  await nextRace.getByRole('button', { name: 'Katson' }).click();

  // Isäntä nostaa rajaa: jonossa ollut pääsee kalastajaksi (#501).
  await row(host, 'Pelaajia enintään').getByRole('button', { name: '4', exact: true }).click();
  await expect(nextRace.locator('button.selected')).toHaveText('Kalastan');
  await expect(host.locator('.choice-label', { hasText: 'Pelaajat 3/4' })).toBeVisible();

  // Aloita ennen kuin muut ovat valmiita: kysymys näkyy nappien yläpuolella
  // eikä jää pitkän aulan loppuun vierityksen taakse (#539).
  await host.getByRole('button', { name: 'Aloita (2 ei valmiina)' }).click();
  const notice = host.locator('.lobby-notice');
  await expect(notice).toContainText(/Ei valmiina: .*Toinen/);
  await expect(notice).toBeInViewport();
  // Odota peruu kysymyksen.
  await host.getByRole('button', { name: 'Odota', exact: true }).click();
  await expect(notice).toBeHidden();
  // Aloita silti: valmiiksi kuittaamattomatkin kalastavat mukana.
  await host.getByRole('button', { name: 'Aloita (2 ei valmiina)' }).click();
  await host.getByRole('button', { name: 'Aloita silti' }).click();
  for (const p of [host, second!, third!]) await expect(p.locator('.hud-timer')).toBeVisible();
  for (const e of errors) e.check();
  await second!.context().close();
  await third!.context().close();
});

test('iso näyttö: ?lahetys-osoite liittyy katsojaksi ja ohjaaja näyttää kisan (#564)', async ({
  page: host,
  browser,
}) => {
  test.setTimeout(120_000);
  await host.goto('/?view=top');
  await host.getByRole('button', { name: 'Pelaa' }).click();
  await host.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(host.getByText('Palvelin päällä')).toBeVisible();
  await host.getByLabel('Nimimerkki').fill('Isäntä');
  await host.getByRole('button', { name: 'Luo uusi huone' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();

  const screen = await (
    await browser.newContext({ locale: 'fi-FI', baseURL: 'http://localhost:4173' })
  ).newPage();
  const errors = [watchErrors(host), watchErrors(screen)];
  // Ei valikoita: osoite vie suoraan aulaan katsojaksi, eikä vie kalastajan paikkaa.
  await screen.goto(`/?lahetys=${code}`);
  await expect(screen.locator('.room-code')).toHaveText(code);
  await expect(host.locator('.choice-label', { hasText: 'Pelaajat 1/' })).toBeVisible();
  await expect(host.locator('.player-list')).toContainText('Iso näyttö');
  await expect(
    screen
      .locator('.choice', { has: screen.locator('.choice-label', { hasText: 'Seuraava kisa' }) })
      .locator('button.selected'),
  ).toHaveText('Katson');

  await host.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(host.locator('.hud-timer')).toBeVisible();
  // Lähetyksen alaotsikko: kisa alkaa yleiskuvalla, ja tulostaulussa on kalastaja.
  const lower = screen.locator('.hud-status.live');
  await expect(lower).toContainText('SUORA');
  await expect(lower).toContainText('yleiskuva');
  await expect(screen.locator('.hud-catches')).toContainText('Isäntä');
  // Ohjaaja siirtyy yleiskuvasta ainoaan kalastajaan.
  await expect(lower).toContainText('Isäntä', { timeout: 30_000 });
  // O kytkee ohjaajan pois: tavallinen katsojan tilarivi.
  await screen.keyboard.press('KeyO');
  await expect(screen.locator('.hud-status')).toContainText('Seuraat: Isäntä');
  await expect(lower).toHaveCount(0);
  await screen.keyboard.press('KeyO');
  await expect(lower).toContainText('SUORA');
  for (const e of errors) e.check();
  await screen.context().close();
});
