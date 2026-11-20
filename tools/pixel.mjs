// « Ça pixellise au déplacement » : séquences d'images consécutives en qualité mobile, pas de temps fixe (33 ms), comme sur
// un téléphone qui tient 30 images/s. Fiche 09 (Champcueil à l'aube), moteur v3, 300 000 grains.
// Usage : node tools/pixel.mjs dossier [sequences…]
//   séquences : marche (avant, 1,4 m/s), rotation (60°/s), les-deux (marche et rotation), arret (image posée, référence)
// Écran : portrait 360 × 651 CSS à ×3 (Samsung milieu de gamme) : la page plafonne à ×1,2, soit 432 × 781, résolution interne
// 252 × 456 (ce que Toine a mesuré sur son téléphone) et capteur 315 × 570, que le navigateur agrandit à l'écran.
// L'horloge de la page est tenue par l'outil (requestAnimationFrame remplacé) : chaque image avance de PAS ms (33 par défaut),
// quelle que soit la lenteur du rendu logiciel. L'image est lue dans le canevas juste après son dessin.
// Variables : PAGE (autre page, pour l'avant), N (images par séquence, 12), PAS (ms), CFG (options JSON ajoutées), IMAGES
// (images accumulées à l'arrêt avant de partir, 8), Z (position sur le sentier, 22).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/pixel', ...seqs] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const fiche = JSON.parse(readFileSync(join(root, 'scenes/09-champcueil-aube.json'), 'utf8'));
const N = +(process.env.N || 12), PAS = +(process.env.PAS || 33), IMAGES = +(process.env.IMAGES || 8);
const cfg = { still: true, nohud: true, nowalk: true, v3: true, full: false, mobile: true, z: +(process.env.Z || 22), scene: fiche,
  ...(process.env.CFG ? JSON.parse(process.env.CFG) : {}) };
const MOUV = { marche: { v: 1.4, w: 0 }, rotation: { v: 0, w: 60 }, 'les-deux': { v: 1.4, w: 60 }, arret: null };

async function sequence(nom) {
  const b = await chromium.launch({ headless: true, args: ARGS }), t0 = Date.now();
  try {
    const p = await b.newPage({ viewport: { width: 360, height: 651 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await p.addInitScript(c => {
      window.__CFG = c; window.__rafQ = []; window.__manuel = false;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => { if (window.__manuel) { window.__rafQ.push(cb); return 1; } return raf(t => window.__manuel ? window.__rafQ.push(cb) : cb(t)); };
    }, cfg);
    await p.goto('file://' + (process.env.PAGE ? resolve(process.env.PAGE) : join(root, 'dist/index.html')), { timeout: 900000 });
    let s = null;
    while ((Date.now() - t0) / 1000 < 1800) { await p.waitForTimeout(1000); s = await p.evaluate(() => window.__state || null); if (s && s.n >= IMAGES) break; }
    await p.waitForTimeout(3000);                                // exposition : laisser le capteur rejoindre sa cible
    await p.evaluate(() => { window.__manuel = true; });
    while (!(await p.evaluate(() => window.__rafQ.length))) await p.waitForTimeout(200);
    const info = await p.evaluate(() => ({ W: window.__state.W, H: window.__state.H, cw: canvas.width, ch: canvas.height, css: [canvas.clientWidth, canvas.clientHeight] }));
    const m = MOUV[nom], nb = m ? N : 1;
    const ms = [];
    for (let k = 1; k <= nb; k++) {
      const r = await p.evaluate(({ m, pas }) => {
        const dt = pas / 1000;
        if (m) { if (m.v) moveBy(m.v * dt); if (m.w) cam.yaw += m.w * Math.PI / 180 * dt; }
        window.__now = (window.__now || performance.now()) + pas;
        const cb = window.__rafQ.shift(), t = performance.now(); cb(window.__now);
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return { url: c.toDataURL('image/png'), ms: performance.now() - t };
      }, { m, pas: PAS });
      writeFileSync(join(root, dir, nom + '-' + String(k).padStart(2, '0') + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
      ms.push(r.ms);
    }
    const med = ms.slice().sort((a, b) => a - b)[ms.length >> 1];
    console.log(nom, ((Date.now() - t0) / 1000).toFixed(0) + ' s', JSON.stringify(info), 'médiane ' + med.toFixed(0) + ' ms/image (lecture comprise)', logs.slice(0, 3).join(' | '));
  } catch (e) { console.log(nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}
for (const nom of seqs.length ? seqs : Object.keys(MOUV)) await sequence(nom);
