import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './apu';

/**
 * Hetken jumittava yhteys (puhelimen verkko, tunnelin hikka) ei saa pudottaa
 * pelaajaa kisasta: jumin aikana lähetetyt viestit saapuvat palvelimelle
 * kerralla, eikä ryöppy saa katkaista yhteyttä (#273).
 */

/** Pidättää selaimen lähettämät viestit, kun `window.__stall` on päällä. */
async function stallableSocket(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __stall: boolean };
    w.__stall = false;
    const Native = window.WebSocket;
    class Stallable extends Native {
      private held: Parameters<WebSocket['send']>[0][] = [];
      private timer = 0;
      override send(data: Parameters<WebSocket['send']>[0]) {
        if (!w.__stall && this.held.length === 0) return super.send(data);
        this.held.push(data);
        if (!this.timer)
          this.timer = window.setInterval(() => {
            if (w.__stall) return;
            window.clearInterval(this.timer);
            this.timer = 0;
            for (const d of this.held.splice(0)) super.send(d);
          }, 20);
      }
    }
    window.WebSocket = Stallable as typeof WebSocket;
  });
}

test('lyhyt verkkojumi kesken kisan ei pudota pelaajaa (#273)', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || isMobile, 'ajetaan kerran, chromium-projektissa');
  const errors = watchErrors(page);
  await stallableSocket(page);
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Pelaa' }).click();
  await page.getByRole('button', { name: 'Moninpeli' }).click();
  await expect(page.getByText('Palvelin päällä')).toBeVisible();
  await page.getByLabel('Nimimerkki').fill('Jumittaja');
  await page.getByRole('button', { name: 'Luo uusi huone' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  await page.getByRole('button', { name: 'Aloita kisa' }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  // Rengas liikkuu koko ajan, joten syötteitä kertyy jumin aikana.
  await page.keyboard.down('w');
  await page.evaluate(() => ((window as unknown as { __stall: boolean }).__stall = true));
  await page.waitForTimeout(5000);
  await page.evaluate(() => ((window as unknown as { __stall: boolean }).__stall = false));
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await expect(page.locator('.hud-timer')).toBeVisible();
  await expect(page.getByText('Yhteys palvelimeen katkesi.')).toHaveCount(0);
  // Kello käy edelleen, eli tilapäivityksiä tulee.
  const t = await page.locator('.hud-timer').innerText();
  await expect.poll(() => page.locator('.hud-timer').innerText()).not.toBe(t);
  errors.check();
});
