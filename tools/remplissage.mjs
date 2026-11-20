// Remplissage des grains de la caméra (fragments tramés et gardés par image) et image, sur la fiche 09 en qualité complète,
// vue de face et regard levé dans les houppiers. Compare la borne des feuilles proches (défaut) à l'absence de borne.
// Usage : node tools/remplissage.mjs [dossier]   (rendu logiciel, quelques minutes)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = process.argv[2] || 'out/remplissage';
mkdirSync(out, { recursive: true });
const POSES = { face: { z: 12 }, houppier: { z: 12, pitch: .95, lookYaw: .5 } };
const MODES = { sans: { feuilG: [1, 16, 100000] }, borne: {} };
const nav = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const [pn, pose] of Object.entries(POSES)) for (const [mn, mode] of Object.entries(MODES)) {
  const page = await nav.newPage({ viewport: { width: 480, height: 300 } });
  await page.addInitScript(c => { window.__CFG = c; }, Object.assign({ v3: true, full: true, scene: 8, still: true, nohud: true, grains: +(process.env.GRAINS || 2500000), ombrage: 'plein' }, pose, mode));
  await page.goto('file://' + resolve(root, process.env.PAGE || 'dist/index.html'), { timeout: 600000 });
  await page.waitForFunction(() => window.__state && window.__state.n >= 1, null, { timeout: 900000, polling: 1000 });
  const r = await page.evaluate(() => window.balade.remplissage());
  console.log(pn.padEnd(9), mn.padEnd(6), JSON.stringify(r), 'tramés par pixel', (r.trames / r.pixels).toFixed(2), 'gardés par pixel', (r.gardes / r.pixels).toFixed(2));
  await page.waitForFunction(() => window.__state && window.__state.n >= 4, null, { timeout: 900000, polling: 1000 });
  await page.screenshot({ path: join(out, pn + '-' + mn + '.png'), timeout: 600000 });
  await page.close();
}
await nav.close();
