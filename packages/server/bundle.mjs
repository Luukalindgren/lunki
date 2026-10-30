// Kokoaa palvelimen ja palauteraportin tiedostoiksi dist/index.mjs ja
// dist/report.mjs, jotka pilvikone ajaa suoraan nodella ilman pnpm:ää ja tsx:ää
// (muistia noin kolmannes, docs/pilvipalvelin.md). @lunki/shared kootaan
// mukaan, muut riippuvuudet luetaan node_modulesista.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@lunki/'));

await build({
  entryPoints: ['src/index.ts', 'src/report.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  external,
  logLevel: 'warning',
});
