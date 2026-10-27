import { expect, test, type Page } from '@playwright/test';
import { startSolo, watchErrors } from './apu';

/** Valinnan esto elementille: CSS-arvot ja estääkö peli selectstartin. */
function selectionState(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    const css = getComputedStyle(el) as CSSStyleDeclaration & {
      webkitUserSelect?: string;
      webkitTouchCallout?: string;
    };
    // selectstartin kohde on tekstisolmu, kun valinta alkaa tekstistä.
    const node = el.firstChild ?? el;
    const start = new Event('selectstart', { bubbles: true, cancelable: true });
    node.dispatchEvent(start);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(menu);
    return {
      userSelect: css.webkitUserSelect || css.userSelect || '',
      // Vain WebKit tuntee -webkit-touch-calloutin.
      callout: css.webkitTouchCallout ?? null,
      selectBlocked: start.defaultPrevented,
      menuBlocked: menu.defaultPrevented,
    };
  }, selector);
}

test('pelin painelu ei valitse HUD-tekstejä, syöttökentät toimivat (#311)', async ({
  page,
  isMobile,
}) => {
  const errors = watchErrors(page);
  await startSolo(page);
  await expect(page.locator('.hud-status')).toBeVisible();

  // iOS: pitkä painallus ei valitse tekstiä eikä avaa Kopioi/Etsi-valikkoa.
  for (const sel of ['.hud-timer', '.hud-status', '.hud-weather']) {
    const s = await selectionState(page, sel);
    expect(s, sel).toMatchObject({ userSelect: 'none', selectBlocked: true, menuBlocked: true });
    expect(['none', null], sel).toContain(s.callout);
  }
  // Tuplanapautus ei zoomaa.
  expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe(
    'manipulation',
  );

  // Hiirellä/sormella tuplapainallus tekstin kohdalla ei valitse mitään.
  const box = (await page.locator('.hud-status').boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (isMobile) {
    await page.touchscreen.tap(at.x, at.y);
    await page.touchscreen.tap(at.x, at.y);
  } else {
    await page.mouse.click(at.x, at.y, { clickCount: 3 });
  }
  expect(await page.evaluate(() => String(document.getSelection()))).toBe('');

  // Nimimerkin ja huonekoodin kentissä teksti valitaan ja kopioidaan kuten ennen.
  await page.goto('/?view=top');
  await page.getByRole('button', { name: 'Moninpeli' }).click();
  const name = page.getByLabel('Nimimerkki');
  await name.fill('Valitsija');
  const field = await selectionState(page, '.screen input[type="text"]');
  expect(field.userSelect).not.toBe('none');
  expect(field.callout === null || field.callout === 'default', field.callout ?? '').toBe(true);
  expect(field.selectBlocked).toBe(false);
  expect(field.menuBlocked).toBe(false);
  await name.selectText();
  expect(
    await name.evaluate((e: HTMLInputElement) => e.value.slice(e.selectionStart!, e.selectionEnd!)),
  ).toBe('Valitsija');
  errors.check();
});
