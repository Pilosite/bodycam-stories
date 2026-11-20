// Houppiers et relief de la fiche 09 (Champcueil à l'aube), moteur v3 : mêmes poses avant et après, PC et téléphone.
// Usage : node tools/arbres.mjs dossier [vues…]
//   PC (qualité complète, 1280 × 800) : face (le long du sentier, soleil de trois quarts), dos (dos au soleil), haut (le regard
//   monte dans les houppiers), enfilade (le sentier devant, au départ), pieds (le sol sous les pieds : le porteur suit-il le sol ?).
//   Téléphone (portrait 390 × 780, qualité mobile comme sur le téléphone) : tel-face, tel-haut.
//   Marche : marche-pc (640 × 400, qualité complète) et marche-tel : trois images successives pendant 3 m de marche, après
//   accumulation à l'arrêt (le houppier scintille-t-il ? le sol suit-il ?).
// Variables : PAGE (autre page que dist/index.html, pour l'avant), FICHE (autre fiche que scenes/09), IMAGES (images
// accumulées à l'arrêt, 8 par défaut), GARDER=1 (ne refait pas une vue déjà rendue).
// Une capture à la fois ; l'image est lue dans la page (drawImage du canevas), comme tools/aube.mjs.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/arbres', ...noms] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const fiche = JSON.parse(readFileSync(resolve(root, process.env.FICHE || 'scenes/09-champcueil-aube.json'), 'utf8'));
const az = fiche.ambiance.soleil.azimut * Math.PI / 180;
const N = +(process.env.IMAGES || 8), NM = +(process.env.MARCHE || 3);
const PC = { still: true, nohud: true, nowalk: true, v3: true, full: true, bureau: false, w: 1280, h: 800, vw: 1280, vh: 800 };
const TEL = { still: true, nohud: true, nowalk: true, v3: true, full: false, mobile: true, vw: 390, vh: 780 };
const VUES = {
  face: { ...PC, z: 22 },
  dos: { ...PC, z: 22, cap: az + Math.PI },
  haut: { ...PC, z: 22, cap: az - 1.2, pitch: .8 },
  enfilade: { ...PC, z: 4, pitch: -.02 },
  pieds: { ...PC, z: 31, pitch: -1.1 },
  'tel-face': { ...TEL, z: 22 },
  'tel-haut': { ...TEL, z: 22, cap: az - 1.2, pitch: .75 },
  'marche-pc': { ...PC, w: 640, h: 400, vw: 640, vh: 400, z: 14, marche: 3 },
  'marche-tel': { ...TEL, z: 14, marche: 3 },
};
const lire = p => p.evaluate(() => new Promise(ok => requestAnimationFrame(() => {
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0); ok(c.toDataURL('image/png')); })), { timeout: 600000 });
const ecrire = (nom, url) => writeFileSync(join(root, dir, nom + '.png'), Buffer.from(url.split(',')[1], 'base64'));

async function vue(nom) {
  const { vw, vh, marche, ...cfg } = VUES[nom], t0 = Date.now();
  const b = await chromium.launch({ headless: true, args: ARGS });
  try {
    const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await p.addInitScript(c => { window.__CFG = c; }, { ...cfg, scene: fiche });
    await p.goto('file://' + (process.env.PAGE ? resolve(process.env.PAGE) : join(root, 'dist/index.html')), { timeout: 900000 });
    let s = null;
    while ((Date.now() - t0) / 1000 < 1800) { await p.waitForTimeout(1000); s = await p.evaluate(() => window.__state || null); if (s && s.n >= N) break; }
    await p.waitForTimeout(2500);                                // exposition : laisser le capteur rejoindre sa cible
    if (!marche) ecrire(nom, await lire(p));
    else {
      const sol = await p.evaluate(() => window.balade.sol(window.__state.x, window.__state.z));
      await p.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), marche);
      let img = s.v3.images, k = 0;
      for (let i = 0; i < 40 * NM && k < NM; i++) {             // NM images neuves de suite (3 par défaut, variable MARCHE), pendant la marche
        await p.waitForTimeout(150); const s2 = await p.evaluate(() => window.__state);
        if (s2.v3.images > img && s2.file > 0) { img = s2.v3.images; ecrire(nom + '-' + (++k), await lire(p)); console.log('  ', nom + '-' + k, 'z=' + s2.z.toFixed(2)); }
      }
      console.log('  sol au départ', JSON.stringify(sol));
    }
    s = await p.evaluate(() => window.__state);
    console.log(nom, ((Date.now() - t0) / 1000).toFixed(0) + ' s', s && s.v3 ? Math.round(s.v3.msMoy) + ' ms/image, grains ' + JSON.stringify(s.v3.grains && { total: s.v3.grains.total, nA: s.v3.grains.nA, nB: s.v3.grains.nB, nF: s.v3.grains.nF }) : '', logs.slice(0, 3).join(' | '));
  } catch (e) { console.log(nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}
for (const nom of noms.length ? noms : Object.keys(VUES)) {
  if (process.env.GARDER && existsSync(join(root, dir, nom + '.png'))) continue;
  await vue(nom);
}
