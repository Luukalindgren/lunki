import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/**
 * Moninpelistä poistuminen vie päävalikkoon ja sinne jäädään: palvelimelta
 * vielä ennen huoneen sulkeutumista saapuva tila ei saa aloittaa kisaa
 * uudelleen eikä tarjota "Palaa kisaan" -nappia.
 */

/**
 * Hidas yhteys (kuten Cloudflare-tunnelin takana): palvelimen viestit tulevat
 * perille vasta hetken päästä, joten huoneesta lähtiessä ehtii vielä saapua
 * tilapäivityksiä. Paikallisesti lähtö kuittautuisi heti.
 */
async function slowSocket(page: Page) {
  await page.addInitScript(() => {
    const DELAY = 300;
    // Viestit ja sulkeutuminen myöhästyvät yhtä paljon, joten järjestys säilyy.
    const SLOW = ['message', 'close'];
    const late =
      <E extends Event>(ws: WebSocket, fn: (e: E) => void) =>
      (e: E) =>
        setTimeout(() => fn.call(ws, e), DELAY);
    const Native = window.WebSocket;
    class Slow extends Native {
      override addEventListener(type: string, fn: never, opts?: never) {
        super.addEventListener(type, SLOW.includes(type) ? (late(this, fn) as never) : fn, opts);
      }
      override set onmessage(fn: ((e: MessageEvent) => void) | null) {
        super.onmessage = fn && late(this, fn);
      }
      override get onmessage() {
        return super.onmessage;
      }
      override set onclose(fn: ((e: CloseEvent) => void) | null) {
        super.onclose = fn && late(this, fn);
      }
      override get onclose() {
        return super.onclose;
      }
    }
    window.WebSocket = Slow as typeof WebSocket;
  });
}

async function startRace(page: Page) {
  await slowSocket(page);
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(page.getByText('Palvelin päällä')).toBeVisible();
  await page.getByLabel('Nimimerkki').fill('Lähtijä');
  await page.getByRole('button', { name: 'Luo uusi huone' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
}

async function expectStaysInMenu(page: Page) {
  await expect(page.getByRole('button', { name: 'Moninpeli' })).toBeVisible();
  // Annetaan palvelimen myöhästyneille tilapäivityksille aikaa.
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: 'Moninpeli' })).toBeVisible();
  await expect(page.locator('.hud-timer')).toBeHidden();
  await expect(page.getByRole('button', { name: /Palaa kisaan/ })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('huone')).toBe(false);
  // Uudelleenlataus ei myöskään palaa huoneeseen.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Moninpeli' })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator('.hud-timer')).toBeHidden();
  await expect(page.getByRole('button', { name: /Palaa kisaan/ })).toHaveCount(0);
}

test('moninpelin taukovalikon Poistu ei palauta kisaan', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || isMobile, 'ajetaan kerran, chromium-projektissa');
  const errors = watchErrors(page);
  await startRace(page);
  // Kello käy, eli tilapäivityksiä tulee jatkuvasti.
  const t = await page.locator('.hud-timer').innerText();
  await expect.poll(() => page.locator('.hud-timer').innerText()).not.toBe(t);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Poistu' }).click();
  await expectStaysInMenu(page);
  errors.check();
});
