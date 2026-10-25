/**
 * LAN-peli: tämä kone on pelipalvelin ja jakaa samalla pelisivun lähiverkkoon.
 * Käynnistys: pnpm lan (rakentaa ensin pelisivun LAN-tilaan, ks. docs/lan.md).
 */
import { GAME_NAME } from '@lunki/shared';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderUnicodeCompact } from 'uqr';
import { lanAddresses } from './lan/addresses';
import { startServer } from './start';

const staticDir =
  process.env.LUNKI_STATIC ?? fileURLToPath(new URL('../../client/dist-lan', import.meta.url));
if (!existsSync(`${staticDir}/index.html`)) {
  console.error(`Pelisivua ei löydy kansiosta ${staticDir}. Aja juuresta: pnpm lan`);
  process.exit(1);
}

/** Colyseus jää varatulla portilla jumiin virheilmoituksen jälkeen, joten tarkistetaan itse. */
const portFree = (port: number) =>
  new Promise<boolean>((done) => {
    const probe = createNetServer()
      .once('error', () => done(false))
      .listen(port, () => probe.close(() => done(true)));
  });

const wanted = Number(process.env.PORT ?? 2567);
if (!(await portFree(wanted))) {
  console.error(
    `Portti ${wanted} on jo käytössä: onko pelipalvelin jo käynnissä? (Toisen portin saa: PORT=2568 pnpm lan)`,
  );
  process.exit(1);
}

const { port } = await startServer({ staticDir });

const urls = lanAddresses(networkInterfaces()).map((a) => ({
  ...a,
  url: `http://${a.address}:${port}`,
}));
const [best, ...others] = urls;

console.log(`\n  ${GAME_NAME} LAN-peli on käynnissä.\n`);
if (best) {
  console.log('  Kaverit avaavat samassa wifissä selaimella:\n');
  console.log(`      ${best.url}\n`);
  // Värit kiinteiksi: koodi on luettava myös vaalealla taustalla.
  const qr = renderUnicodeCompact(best.url, { border: 2 }).split('\n');
  console.log(qr.map((l) => `  \x1b[97;40m${l}\x1b[0m`).join('\n'));
  if (others.length) {
    console.log('\n  Jos ei aukea, kokeile näitä:');
    for (const o of others) console.log(`      ${o.url}   (${o.iface})`);
  }
} else {
  console.log('  Konetta ei ole kytketty lähiverkkoon. Yhdistä wifiin ja käynnistä uudelleen.');
}
console.log(`\n  Tällä koneella: http://localhost:${port}`);
console.log('  Lopetus: Ctrl+C\n');
