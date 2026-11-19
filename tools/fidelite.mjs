// Fidélité de la forêt (moteur v3, qualité complète) : mêmes poses avant et après, au format PC et portrait.
// Usage : node tools/fidelite.mjs dossier [fiche.json|-] [vues…]
//   fiche.json : une fiche qui remplace scenes/01 (par exemple la 01 fusionnée avec essais/champcueil-sous-bois.json :
//   FRAGMENT=essais/champcueil-sous-bois.json la fusionne d'office) ; « - » : la fiche 01 telle quelle.
//   GARDER=1 : ne refait pas les vues déjà rendues. CFG='{…}' : options de page en plus (tools/shot.mjs) ; FORMAT=pc|portrait|les-deux (défaut les-deux) ; IMAGES=n images accumulées à l'arrêt (défaut 8) ; MOBILE=1 qualité mobile.
// Vues : poses le long du sentier (z0, z22, z40, z56), gros plans à environ 1 m (sol, rocher, bouleau, pin, pin-haut, chene),
// et « marche » (image prise pendant 1,2 m de marche, après accumulation). Les poses des arbres viennent de leurs cellules
// (arbreA, percheB de monde.glsl, graine 4821) : pin à z 34,97, bouleau à z 12,8, chêne à z 18,44.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/fidelite', ficheArg = '-', ...noms] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
let fiche = JSON.parse(readFileSync(join(root, ficheArg === '-' ? 'scenes/01-grands-avaux.json' : ficheArg), 'utf8'));
if (process.env.FRAGMENT) {                                     // fusion superficielle, comme le ferait la fiche 09
  const fr = JSON.parse(readFileSync(resolve(root, process.env.FRAGMENT), 'utf8'));
  for (const [k, v] of Object.entries(fr)) if (!k.startsWith('_')) fiche[k] = v && typeof v === 'object' && !Array.isArray(v) && fiche[k] && typeof fiche[k] === 'object' ? { ...fiche[k], ...v } : v;
}
const VUES = {
  z0: { z: 0 },
  z22: { z: 22, pitch: -.12 },
  z40: { z: 40, lookYaw: 1.1 },
  z56: { z: 56, lookYaw: -.5, pitch: -.1 },
  sol: { z: 26, dx: 1.3, cap: 1.5708, pitch: -.95 },                 // litière à 1 m, au bord du sentier
  rocher: { z: 22.77, dx: -.65, cap: 1.5708 },                      // bloc de grès à 1 m
  bouleau: { z: 12.8, dx: -.5, cap: -1.5708, pitch: -.15 },         // perche de bouleau à 1 m
  pin: { z: 34.97, dx: .55, cap: 1.5708, pitch: .1 },               // pin sylvestre à 1 m
  'pin-haut': { z: 34.97, dx: -1.2, cap: 1.5708, pitch: .75 },      // le même, le regard monte vers l'écorce orangée
  chene: { z: 18.44, dx: -2.2, cap: -1.5708 },                      // chêne à 1 m
  marche: { z: 18, marche: 1.2 },
};
const FORMATS = { pc: [1280, 800], portrait: [450, 800] };
const formats = (process.env.FORMAT || 'les-deux') === 'les-deux' ? ['pc', 'portrait'] : [process.env.FORMAT];
const liste = noms.length ? noms : Object.keys(VUES);
const N = +(process.env.IMAGES || 8);

async function attendre(p, n, max = 1500) {
  const t0 = Date.now(); let s = null;
  while ((Date.now() - t0) / 1000 < max) { await p.waitForTimeout(1000); s = await p.evaluate(() => window.__state || null); if (s && s.n >= n) break; }
  return s;
}
import { existsSync } from 'node:fs';
async function vue(fmt, nom) {
  const V = VUES[nom], [w, h] = FORMATS[fmt], t0 = Date.now(), f = join(root, dir, `${nom}-${fmt}.png`);
  const b = await chromium.launch({ headless: true, args: ARGS });     // un navigateur par vue : un plantage n'emporte pas la série
  try {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    const { marche, ...pose } = V;
    await p.addInitScript(c => { window.__CFG = c; }, { still: true, nohud: true, nowalk: true, v3: true, full: !process.env.MOBILE, scene: fiche, ...pose, ...JSON.parse(process.env.CFG || '{}') });
    await p.goto('file://' + join(root, process.env.PAGE || 'dist/index.html'), { timeout: 900000 });
    let s = await attendre(p, N);
    if (marche) {
      await p.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), marche);
      let k = 0; for (;;) { await p.waitForTimeout(500); s = await p.evaluate(() => window.__state); if (s.file === 0 || ++k > 8) break; }
    }
    await p.screenshot({ path: f, timeout: 600000 });
    console.log(nom, fmt, ((Date.now() - t0) / 1000).toFixed(0) + ' s', 'n=' + (s && s.n), logs.slice(0, 3).join(' | '));
    return true;
  } catch (e) { console.log(nom, fmt, 'ÉCHEC', String(e.message || e).split('\n')[0]); return false; }
  finally { await b.close().catch(() => {}); }
}
for (const fmt of formats) for (const nom of liste) {
  if (process.env.GARDER && existsSync(join(root, dir, `${nom}-${fmt}.png`))) continue;   // GARDER=1 : reprend une série interrompue
  if (!await vue(fmt, nom)) await vue(fmt, nom);                // une seconde chance
}
