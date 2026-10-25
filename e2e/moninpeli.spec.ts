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
 * suomeksi. Ajetaan vain chromium-projektissa, koska testi käynnistää muut
 * selaimet itse.
 */

/** Liittyjän napit ja tekstit kielen mukaan. */
const GUEST_TEXT = {
  fi: {
    multiplayer: 'Moninpeli',
    serverOk: 'Palvelin päällä',
    nickname: 'Nimimerkki',
    roomCode: 'Huonekoodi',
    join: 'Liity koodilla',
    ready: 'Valmis!',
  },
  en: {
    multiplayer: 'Multiplayer',
    serverOk: 'Server is up',
    nickname: 'Nickname',
    roomCode: 'Room code',
    join: 'Join with a code',
    ready: 'Ready!',
  },
};
test('moninpeli: Chromium, Firefox ja iPhone samassa huoneessa', async ({
  page: host,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || isMobile, 'ajetaan kerran, chromium-projektissa');
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

    await host.goto('/');
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
      const press = (label: string) =>
        touch
          ? guest.getByRole('button', { name: label }).tap()
          : guest.getByRole('button', { name: label }).click();
      await guest.goto('/');
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
    // Kisan kello käy kaikilla.
    for (const p of [host, ff, ios]) {
      const t = await p.locator('.hud-timer').innerText();
      await expect.poll(() => p.locator('.hud-timer').innerText(), { timeout: 20_000 }).not.toBe(t);
    }

    for (const [name, errors] of pages) {
      test.info().annotations.push({ type: name, description: errors.errors.join(' | ') || 'ok' });
      errors.check();
    }
  } finally {
    await Promise.all(others.map((b) => b.close()));
  }
});
