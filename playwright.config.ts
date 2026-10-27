import { defineConfig, devices } from '@playwright/test';

/**
 * Selaintestit (e2e/): peli tuotantobuildina (vite preview) ja pelipalvelin
 * paikallisesti. Sama testisarja ajetaan Chromiumilla, Firefoxilla ja
 * WebKitillä (Safarin moottori) sekä puhelinemuloinneilla. Aja ensin
 * `pnpm build`, sitten `pnpm e2e`.
 */
/** WebGL ilman näytönohjainta (CI): Chromium tarvitsee luvan ohjelmistorenderöintiin. */
const SWIFTSHADER = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
/**
 * Headless-Firefoxilla ei ole OpenGL-ajuria lainkaan, joten CI ajaa sen
 * näkyvänä virtuaalinäytöllä (xvfb-run, Mesan ohjelmistorenderöinti). Mesa on
 * Firefoxin estolistalla ("AllowWebgl2:false"), siksi WebGL pakotetaan päälle.
 */
export const FIREFOX_WEBGL = {
  headless: !process.env.DISPLAY,
  firefoxUserPrefs: { 'webgl.force-enabled': true },
};

const MULTIPLAYER = /moninpeli\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  // Ohjelmistorenderöinti on hidasta: liian moni selain kerralla tukehduttaa koneen.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // Testit etsivät suomenkielisiä nappeja; englanti testataan erikseen.
    locale: 'fi-FI',
    // Service worker (#328) ohittaisi sivun pyyntöjen sieppauksen osassa
    // selaimista; se testataan erikseen (offline.spec.ts).
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...[
      { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: SWIFTSHADER } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: FIREFOX_WEBGL } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      { name: 'iphone', use: { ...devices['iPhone 15'] } },
      { name: 'android', use: { ...devices['Pixel 7'], launchOptions: SWIFTSHADER } },
    ].map((p) => ({ ...p, testIgnore: MULTIPLAYER })),
    // Moninpelitesti käynnistää Chromiumin lisäksi Firefoxin ja WebKitin. Omana
    // projektinaan (ja CI:ssä omana ajonaan), koska kolme ohjelmistorenderöivää
    // selainta kerralla tukehdutti rinnalla ajetut testit.
    {
      name: 'moninpeli',
      testMatch: MULTIPLAYER,
      use: { ...devices['Desktop Chrome'], launchOptions: SWIFTSHADER },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @lunki/client preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm run server',
      url: 'http://localhost:2567/__healthcheck',
      reuseExistingServer: !process.env.CI,
      env: { LUNKI_DB: ':memory:' },
    },
  ],
});
