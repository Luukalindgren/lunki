import { expect, test, type Page } from '@playwright/test';
import { raceRunning, soloUrl, watchErrors } from './apu';

/**
 * Peliohjain (Gamepad API) korvataan sivulla ohjelmallisella ohjaimella:
 * selaimet eivät anna testeille oikeaa ohjainta. Ohjain on vakioasettelun
 * Xbox-ohjain, ja `__padPolls` laskee, montako kertaa peli on lukenut sen.
 */
function installPad(): void {
  const w = window as unknown as {
    __pad: { buttons: { pressed: boolean; value: number }[]; axes: number[] };
    __padPolls: number;
  };
  const pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  w.__pad = pad;
  w.__padPolls = 0;
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value: () => {
      w.__padPolls++;
      return [pad];
    },
  });
}

const polls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __padPolls: number }).__padPolls);

/** Nappi pohjaan tai irti ja odotus, että peli on lukenut ohjaimen sen jälkeen. */
async function setButton(page: Page, i: number, down: boolean): Promise<void> {
  await page.evaluate(
    ([i, down]) => {
      const b = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } })
        .__pad.buttons[i]!;
      b.pressed = down;
      b.value = down ? 1 : 0;
    },
    [i, down] as const,
  );
  const before = await polls(page);
  await expect.poll(() => polls(page)).toBeGreaterThan(before + 1);
}

async function tap(page: Page, i: number): Promise<void> {
  await setButton(page, i, true);
  await setButton(page, i, false);
}

const A = 0;
const B = 1;
const DOWN = 13;
const MENU = 9;

const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim());

/** Ristiohjain alas, kunnes nimetty nappi on kohdistettu. */
async function focusButton(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 20 && (await focused(page)) !== name; i++) await tap(page, DOWN);
  expect(await focused(page)).toBe(name);
}

test('peliohjain: valikot, ohjeen napit, heitto ja tauko', async ({ page, isMobile }) => {
  test.skip(isMobile, 'puhelimilla ohjaimen ohje on sama, kosketusnapit testataan erikseen');
  const errors = watchErrors(page);
  await page.addInitScript(installPad);
  await page.goto(soloUrl());
  await expect(page.getByRole('button', { name: 'Pelaa' })).toBeVisible();

  // Valikot ristiohjaimella ja A:lla.
  await focusButton(page, 'Pelaa');
  await tap(page, A);
  // DIAG
  console.log(
    'DIAG',
    JSON.stringify(
      await page.evaluate(() => ({
        active: document.activeElement?.outerHTML.slice(0, 120),
        kb: document.querySelector('.screen')?.className,
        title: document.querySelector('.screen h1, .screen h2')?.textContent,
        polls: (window as unknown as { __padPolls: number }).__padPolls,
        gp: typeof navigator.getGamepads,
        own: Object.getOwnPropertyNames(navigator),
      })),
    ),
  );
  await expect(page.getByRole('button', { name: 'Yksinpeli' })).toBeVisible();
  await focusButton(page, 'Yksinpeli');
  await tap(page, A);
  await expect(page.getByRole('button', { name: 'Aloita kisa' })).toBeVisible();
  await focusButton(page, 'Aloita kisa');
  await tap(page, A);
  await raceRunning(page);

  // Ohje näyttää ohjaimen napit.
  await expect(page.locator('.hud-help')).toContainText('A/RT pohjassa = kelaa');

  // Heitto: A pohjassa ja päästä, kuten välilyönti.
  const line = async () => {
    const text = (await page.locator('.hud-status').textContent()) ?? '';
    return Number(/Siimaa ([\d,]+) m/.exec(text)?.[1]?.replace(',', '.') ?? 0);
  };
  await expect.poll(line).toBe(0);
  await setButton(page, A, true);
  await expect
    .poll(() => page.locator('.hud-power-fill').evaluate((e) => parseFloat(e.style.height) || 0))
    .toBeGreaterThan(40);
  await setButton(page, A, false);
  await expect.poll(line, { timeout: 10_000 }).toBeGreaterThan(3);

  // Menu avaa tauon, B jatkaa.
  await tap(page, MENU);
  await expect(page.getByRole('button', { name: 'Jatka' })).toBeVisible();
  await tap(page, B);
  await expect(page.getByRole('button', { name: 'Jatka' })).toBeHidden();
  errors.check();
});
