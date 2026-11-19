// Rend dist/index.html dans Chrome sans écran et enregistre une capture.
// Sans GPU, Chrome calcule en logiciel : c'est lent, mais suffisant pour vérifier qu'un shader compile et juger une image.
//
// Usage : node tools/shot.mjs sortie.png [options JSON] [passes] [largeur] [hauteur] [délai max en s]
// Exemple : node tools/shot.mjs out/vue.png '{"still":true,"nohud":true,"z":22}' 14 480 270
//
// Options lues par la page (window.__CFG) :
//   still    fige le grain et le tremblement de main      nohud    masque l'interface
//   z        position le long du sentier, en mètres       yaw, pitch   orientation de départ
//   w, h     résolution interne forcée                    maxSpp   nombre de passes maximum
//   prevOnly reste en aperçu de mouvement                 scene    fiche de lieu qui remplace celle du build
//   seed     graine du monde
//
// CHROME=/chemin/vers/chrome force l'exécutable (sinon celui de Playwright).
import { chromium } from 'playwright';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, out = 'out/vue.png', cfgJson = '{}', spp = '8', vw = '480', vh = '270', timeout = '300'] = process.argv;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.addInitScript(c => { window.__CFG = c; }, JSON.parse(cfgJson));
await page.goto('file://' + join(root, 'dist/index.html'), { timeout: +timeout * 1000 });   // la compilation du shader peut retarder le chargement

const t0 = Date.now(); let state = null; let failed = '';
while ((Date.now() - t0) / 1000 < +timeout) {
  await page.waitForTimeout(1000);
  state = await page.evaluate(() => window.__state || null);
  failed = await page.evaluate(() => { const e = document.getElementById('err'); return e && e.style.display === 'flex' ? e.textContent : ''; });
  if (failed || (state && state.n >= +spp)) break;
}
await page.screenshot({ path: resolve(out) });
await browser.close();

console.log(JSON.stringify({ sortie: out, etat: state, secondes: +((Date.now() - t0) / 1000).toFixed(1) }));
const real = logs.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource'));
if (real.length) console.log(real.slice(0, 10).join('\n'));
if (failed) { console.error(failed); process.exit(1); }
if (!state || state.n < +spp) { console.error('Délai dépassé avant le nombre de passes demandé.'); process.exit(2); }
