import { expect, test, type Page } from '@playwright/test';
import { audioStates, canvasColors, compassOffset, timer, trackAudio, watchErrors } from './apu';

/**
 * Sormella veto. Chromiumissa oikeat kosketustapahtumat (CDP); WebKitissä
 * Playwright osaa vain napautuksen, joten veto tehdään hiirellä (tatti ei
 * erottele osoitintyyppiä).
 */
async function drag(
  page: Page,
  browserName: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs: number,
) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
      });
    await touch('touchStart', from);
    for (let i = 1; i <= 5; i++)
      await touch('touchMove', {
        x: from.x + ((to.x - from.x) * i) / 5,
        y: from.y + ((to.y - from.y) * i) / 5,
      });
    await page.waitForTimeout(holdMs);
    await touch('touchEnd');
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

test.describe('puhelin', () => {
  test('kosketusohjaimet, POV ja ääni', async ({ page, isMobile, browserName }, info) => {
    test.skip(!isMobile, 'vain puhelinemuloinnit');
    const errors = watchErrors(page);
    await trackAudio(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yksinpeli' }).tap();
    await page.getByRole('button', { name: 'Aloita kisa' }).tap();
    await expect(page.locator('.hud-timer')).toBeVisible();
    await expect(page.locator('.touch-controls')).toBeVisible();

    const t0 = await timer(page);
    await expect.poll(() => timer(page), { timeout: 15_000 }).not.toBe(t0);
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('pysty', { body: await page.screenshot(), contentType: 'image/png' });

    // Tatti oikealle kääntää kalastajaa.
    const stick = (await page.locator('.touch-stick').boundingBox())!;
    const centre = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    const before = await compassOffset(page);
    await drag(page, browserName, centre, { x: centre.x + 60, y: centre.y }, 1500);
    await expect.poll(() => compassOffset(page)).not.toBe(before);

    // KAM-nappi: kalastajan silmin.
    await page.getByRole('button', { name: 'KAM' }).tap();
    await page.waitForTimeout(1500);
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('pysty-pov', { body: await page.screenshot(), contentType: 'image/png' });

    // ELE-nappi avaa käsimerkit; napautus tekee eleen (#228).
    await page.getByRole('button', { name: 'ELE' }).tap();
    await expect(page.locator('.emote-menu')).toBeVisible();
    await page.locator('.emote-option').first().tap();
    await expect(page.locator('.emote-menu')).toBeHidden();

    // Ääni käynnistyy pelkistä napautuksista.
    await expect.poll(() => audioStates(page)).toContain('running');

    // Vaakasuunta: HUD ja ohjaimet mahtuvat yhä ruudulle.
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(800);
    await expect(page.locator('.touch-stick')).toBeInViewport();
    await expect(page.locator('.touch-reel')).toBeInViewport();
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    await info.attach('vaaka-pov', { body: await page.screenshot(), contentType: 'image/png' });

    errors.check();
  });
});
