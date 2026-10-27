/**
 * Renderöi LinkedIn-kansikuvat (1584×396) POV-näkymästä ilman HUDia.
 * Kuvat ja kuvakulmat: kuvat.json. Valmiit kuvat: docs/kansikuvat/.
 *
 *   cd packages/client
 *   NODE_ENV=development npx vite build --outDir /tmp/lunki-dev   # pitää window.lunkin
 *   npx vite preview --outDir /tmp/lunki-dev --port 4310 &
 *   cd ../.. && node scripts/kansikuva/renderoi.mjs [http://localhost:4310] [docs/kansikuvat]
 *
 * Sivu piirretään 1584×528-kokoisena (skaalaus 2 → sisäinen 792×264, kuten
 * jakokuvassa) ja kuvasta rajataan 396 riviä alkaen kohdasta `crop`.
 * Matala vesi (< 3 m) näkyy turkoosina; syvä vesi on tummaa ja laikukasta.
 */
/* global window, document */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [url = 'http://localhost:4310', outDir = 'docs/kansikuvat'] = process.argv.slice(2);
const shots = JSON.parse(readFileSync(new URL('./kuvat.json', import.meta.url), 'utf8'));
const W = 1584;
const H = 528;
const COVER_HEIGHT = 396;
// Limenvihreä rengas kuten jakokuvassa.
const APPEARANCE = { tube: 0xa3c45a, fins: 0x1c232b, shirt: 0x5f6b78, line: 0xf08a2c };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error(s.file, e.message));
  await page.addInitScript(
    (a) => localStorage.setItem('lunki.appearance', JSON.stringify(a)),
    APPEARANCE,
  );
  await page.goto(`${url}/?difficulty=easy&seed=5&minutes=30&weather=realistic&time=${s.time}`);
  await page.waitForFunction(() => window.lunki, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate((s) => {
    const g = window.lunki;
    const rod = s.rod ?? false;
    const tube = s.tube ?? false;
    g.setViewMode('pov', false);
    g.weather.plan.segments = [{ start: 0, sky: 'calm', windSpeed: 0, windDir: 0.6 }];
    g.competition.elapsed = s.elapsed;
    const pos = s.pos ?? g.tube.pos;
    g.tube = { ...g.tube, pos, vel: { x: 0, y: 0 }, heading: s.heading, angVel: 0 };
    g.view.snapTo(pos);
    const pov = g.pov;
    const apply = pov.apply.bind(pov);
    pov.apply = (...args) => {
      apply(...args);
      g.povRod.group.visible = rod;
      g.povTube.group.visible = tube;
      g.fishingView.aimLine.visible = false;
      g.fishingView.aimMarker.visible = false;
      if (!rod) g.fishingView.group.visible = false;
      pov.camera.fov = s.fov ?? 50;
      pov.camera.updateProjectionMatrix();
      pov.camera.rotation.x = s.pitch ?? -0.03;
      pov.camera.updateMatrixWorld();
    };
    // Vain pelikuva näkyviin, HUD piiloon.
    const style = document.createElement('style');
    style.textContent =
      '*{visibility:hidden!important} canvas.game-canvas{visibility:visible!important}';
    document.head.appendChild(style);
  }, s);
  await page.waitForTimeout(4000);
  await page.screenshot({
    path: `${outDir}/${s.file}.png`,
    clip: { x: 0, y: s.crop, width: W, height: COVER_HEIGHT },
  });
  await page.close();
  console.log(s.file);
}
await browser.close();
