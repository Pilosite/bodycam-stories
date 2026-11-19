// Le semeur v3 sur toutes les fiches embarquées, contre le lanceur de rayons (docs/moteur-v3.md, « Le v3 rend tous les mondes »).
// Usage : node tools/v3monde.mjs [dossier] [groupes…]   groupes : fiches marche proches regard (tous par défaut)
//   fiches  : pour chaque fiche de scenes/, le lanceur de rayons (16 passes) et le v3 (16 images accumulées), même pose,
//             qualité complète ;
//   marche  : le v3 après 6 m de marche sur les fiches bâties (06 à 08), image prise à l'arrêt du pas (sans accumulation) ;
//   proches : gros plans à 0,5 m et 2 m d'un tronc, d'un bloc de grès, d'une façade : v3 sans puis avec les éléments
//             proches dessinés en boîtes (option v3proches), et le lanceur de rayons ;
//   regard  : regard levé (pitch 0,9 ; 1,2 ; 1,35) en v3, qualité complète et mobile, et l'ancien maillage du sol.
// Les images vont dans le dossier, la planche dans out/v3monde-planche.png. Rendu logiciel : deux navigateurs à la fois.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/v3monde', ...groupes] = process.argv;
const G = new Set(groupes.length ? groupes : ['fiches', 'marche', 'proches', 'regard']);
mkdirSync(join(root, dir), { recursive: true });
const W = 270, H = 480, ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const base = { still: true, nohud: true, nowalk: true };
const fiches = [0, 1, 2, 3, 4, 5, 6, 7];
const POSES = [{ z: 22 }, { z: 22 }, { z: 14, lookYaw: .4 }, { pitch: -.15 }, { z: 2 }, { z: 6 }, { z: 4 }, { z: 3, lookYaw: .5 }];

const jobs = [];
if (G.has('fiches')) for (const i of fiches) {
  jobs.push({ nom: `f${i}-rayons`, cfg: { ...base, scene: i, ...POSES[i] }, n: 16 });
  jobs.push({ nom: `f${i}-v3`, cfg: { ...base, scene: i, v3: true, ...POSES[i] }, n: 16 });
}
if (G.has('marche')) for (const i of [5, 6, 7]) jobs.push({ nom: `f${i}-v3-marche`, cfg: { ...base, scene: i, v3: true, ...POSES[i] }, n: 4, marche: 6 });
if (G.has('proches')) {
  const vues = { tronc05: { z: 34.96, dx: 1.05, cap: 1.5708 }, tronc2: { z: 34.96, dx: -.45, cap: 1.5708 },
    bloc05: { z: 22.77, dx: -.15, cap: 1.5708 }, bloc2: { z: 22.77, dx: -1.6, cap: 1.5708 },
    facade2: { scene: 5, z: 10, dx: 3.6, cap: 1.5708 } };
  for (const [k, v] of Object.entries(vues)) {
    jobs.push({ nom: `p-${k}-avant`, cfg: { ...base, v3: true, v3proches: false, v3max: 1, ...v }, n: 1 });   // une image seule : ce qu'on voit en marche
    jobs.push({ nom: `p-${k}-apres`, cfg: { ...base, v3: true, v3max: 1, ...v }, n: 1 });
    jobs.push({ nom: `p-${k}-rayons`, cfg: { ...base, ...v }, n: 12 });
  }
}
if (G.has('regard')) for (const pt of [.9, 1.2, 1.35]) {
  jobs.push({ nom: `r-${pt}-complete`, cfg: { ...base, v3: true, z: 22, pitch: pt }, n: 6 });
  jobs.push({ nom: `r-${pt}-mobile`, cfg: { ...base, v3: true, z: 22, pitch: pt, full: false }, n: 6 });
  if (pt === 1.2) jobs.push({ nom: `r-${pt}-solPlein`, cfg: { ...base, v3: true, z: 22, pitch: pt, full: false, v3solPlein: true }, n: 6 });
}

const browser = await chromium.launch({ headless: true, args: ARGS });
async function rendre(j) {
  const out = join(root, dir, j.nom + '.png');
  if (existsSync(out) && !process.env.REFAIRE) return;
  const b = await chromium.launch({ headless: true, args: ARGS });   // un navigateur par vue : une chute n'emporte pas les autres
  try {
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  await p.addInitScript(c => { window.__CFG = c; }, j.cfg);
  await p.goto('file://' + join(root, process.env.PAGE || 'dist/index.html'), { timeout: 600000 });   // PAGE : une autre page (copie figée pendant qu'on travaille)
  const t0 = Date.now(); let s = null;
  while ((Date.now() - t0) / 1000 < 1200) { await p.waitForTimeout(1000); s = await p.evaluate(() => window.__state || null); if (s && s.n >= j.n) break; }
  if (j.marche) {
    await p.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), j.marche);
    for (;;) { await p.waitForTimeout(300); s = await p.evaluate(() => window.__state); if (s.file === 0) break; }
  }
  await p.screenshot({ path: out, timeout: 300000 });
  console.log(j.nom, ((Date.now() - t0) / 1000).toFixed(0) + ' s', s && s.v3 ? 'v3 ' + s.v3.msMoy + ' ms' : 'n ' + (s && s.n), logs.slice(0, 3).join(' | '));
  } catch (e) { console.log(j.nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}
for (let i = 0; i < jobs.length; i += 2) await Promise.all(jobs.slice(i, i + 2).map(rendre));

// planche : une rangée par groupe d'images
const img = n => { const f = join(root, dir, n + '.png'); return existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : null; };
const T = ['01 forêt', '02 nuit, lampe', '03 voilé, été', '04 dunes', '05 maison, lapin', '06 San Francisco', '07 village, nuit', '08 cimetière'];
const lignes = [
  { titre: 'Lanceur de rayons, 16 passes', noms: fiches.map(i => [`f${i}-rayons`, T[i]]) },
  { titre: 'Moteur v3, 16 images, même pose', noms: fiches.map(i => [`f${i}-v3`, T[i]]) },
  { titre: 'v3 après 6 m de marche (image de marche) ; gros plans : une image v3 seule, sans / avec éléments proches, puis rayons', noms: [[`f5-v3-marche`, '06 marche'], [`f6-v3-marche`, '07 marche'], [`f7-v3-marche`, '08 marche'],
    ['p-facade2-avant', 'façade 2 m, avant'], ['p-facade2-apres', 'façade 2 m, après'], ['p-facade2-rayons', 'façade 2 m, rayons']] },
  { titre: 'Gros plans (une image v3 seule) : avant / après / lanceur de rayons', noms: [['p-tronc05-avant', 'tronc 0,5 m, avant'], ['p-tronc05-apres', 'après'], ['p-tronc05-rayons', 'rayons'],
    ['p-tronc2-avant', 'tronc 2 m, avant'], ['p-tronc2-apres', 'après'], ['p-tronc2-rayons', 'rayons']] },
  { titre: 'Gros plans de bloc de grès', noms: [['p-bloc05-avant', 'bloc 0,5 m, avant'], ['p-bloc05-apres', 'après'], ['p-bloc05-rayons', 'rayons'],
    ['p-bloc2-avant', 'bloc 2 m, avant'], ['p-bloc2-apres', 'après'], ['p-bloc2-rayons', 'rayons']] },
  { titre: 'Regard levé (v3) : qualité complète, mobile, ancien maillage du sol', noms: [['r-0.9-complete', 'pitch 0,9 complète'], ['r-1.2-complete', '1,2 complète'], ['r-1.35-complete', '1,35 complète'],
    ['r-0.9-mobile', '0,9 mobile'], ['r-1.2-mobile', '1,2 mobile'], ['r-1.35-mobile', '1,35 mobile'], ['r-1.2-solPlein', '1,2 mobile, v3solPlein']] },
].map(l => ({ titre: l.titre, imgs: l.noms.map(([n, t]) => ({ src: img(n), t })) }));
const q = await browser.newPage();
const png = await q.evaluate(async ({ lignes, W, H }) => {
  const load = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const c = document.createElement('canvas'), m = 10, th = 24, lh = 18, cols = Math.max(...lignes.map(l => l.imgs.length));
  c.width = cols * (W + m) + m; c.height = lignes.length * (H + th + lh + m) + m;
  const g = c.getContext('2d'); g.fillStyle = '#141414'; g.fillRect(0, 0, c.width, c.height);
  let y = m;
  for (const l of lignes) {
    g.fillStyle = '#eee'; g.font = '600 15px sans-serif'; g.fillText(l.titre, m, y + 17); y += th;
    for (let k = 0; k < l.imgs.length; k++) { const x = m + k * (W + m);
      if (l.imgs[k].src) g.drawImage(await load(l.imgs[k].src), x, y, W, H); else { g.fillStyle = '#333'; g.fillRect(x, y, W, H); }
      g.fillStyle = '#bbb'; g.font = '13px sans-serif'; g.fillText(l.imgs[k].t, x, y + H + 14); }
    y += H + lh + m;
  }
  return c.toDataURL('image/png');
}, { lignes, W, H });
writeFileSync(join(root, 'out/v3monde-planche.png'), Buffer.from(png.split(',')[1], 'base64'));
console.log('Planche : out/v3monde-planche.png');
await browser.close();
