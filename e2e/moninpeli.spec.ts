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
