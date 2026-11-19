// Scène d'ouverture « aube » (scenes/09-champcueil-aube.json) : planche de choix de l'heure et vues plein format, moteur v3.
// Usage : node tools/aube.mjs dossier [planche|vues|tout] [noms…]
//   planche : 2 poses (trois quarts contre-jour le long du sentier ; dos au soleil) × 4 réglages (3°, 8° avec brume, 15°,
//             8° sans brume), qualité complète, format PC ; vignettes étiquetées, puis dossier/planche-heure.png
//   vues    : plein format 1280 × 800 de la fiche telle quelle (face au soleil, dos au soleil, tronc de près) et une vue
//             portrait de téléphone (qualité mobile, comme sur le téléphone)
// Une capture à la fois (rendu logiciel lent). L'image est lue dans la page (drawImage du canevas juste après son dessin) :
// la capture d'écran de Playwright faisait tomber le navigateur à 1280 × 800 en rendu logiciel.
// Variables : PASSES (images accumulées, 8 par défaut), W et H (résolution interne en plein format, 1280 × 800 par défaut ;
// SwiftShader ne tient parfois pas plus), GRAINS (budget de grains, celui de la qualité complète par défaut).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/aube', quoi = 'tout', ...noms] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const fiche = JSON.parse(readFileSync(join(root, 'scenes/09-champcueil-aube.json'), 'utf8'));
const az = fiche.ambiance.soleil.azimut * Math.PI / 180;
const PASSES = +(process.env.PASSES || 8);
const avec = (h, brume) => {                                     // la même fiche, seule l'heure (et la brume) change
  const f = JSON.parse(JSON.stringify(fiche));
  f.ambiance.soleil.hauteur = h;
  if (!brume) { delete f.ambiance.brume_basse; f.ambiance.brume = 0.003; }
  return f;
};
const POSES = {
  face: { z: 22 },                                               // le long du sentier, soleil à droite entre les troncs
  dos: { z: 22, cap: az + Math.PI },                            // dos au soleil : les ombres partent devant
  tronc: { z: 17.64, dx: -2.7, cap: 4.66 },                     // bouleau à un mètre et demi, soleil sur la droite (de côté)
};
const REGLAGES = [
  { nom: 'h03', h: 3, brume: true, etiquette: 'soleil 3° · vers 8 h 05' },
  { nom: 'h08', h: 8, brume: true, etiquette: 'soleil 8° · vers 8 h 40 · brume basse' },
  { nom: 'h15', h: 15, brume: true, etiquette: 'soleil 15° · vers 9 h 40' },
  { nom: 'h08s', h: 8, brume: false, etiquette: 'soleil 8° · vers 8 h 40 · sans brume' },
];
const base = { still: true, nohud: true, nowalk: true, v3: true, full: true, bureau: false };
if (process.env.GRAINS) base.grains = +process.env.GRAINS;

async function rendre(nom, cfg, vw, vh) {
  const out = join(root, dir, nom + '.png');
  const b = await chromium.launch({ headless: true, args: ARGS });
  try {
    const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await p.addInitScript(c => { window.__CFG = c; }, cfg);
    await p.goto('file://' + (process.env.PAGE || join(root, 'dist/index.html')), { timeout: 600000 });
    const t0 = Date.now(); let s = null;
    while ((Date.now() - t0) / 1000 < 1800) { await p.waitForTimeout(1000); s = await p.evaluate(() => window.__state || null); if (s && s.n >= PASSES) break; }
    await p.waitForTimeout(2500);                                // exposition : laisser le capteur rejoindre sa cible
    const url = await p.evaluate(() => new Promise(ok => requestAnimationFrame(() => {
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      c.getContext('2d').drawImage(canvas, 0, 0); ok(c.toDataURL('image/png')); })), { timeout: 600000 });
    writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log(nom, ((Date.now() - t0) / 1000).toFixed(0) + ' s', s && s.v3 ? Math.round(s.v3.msMoy) + ' ms/image' : '', logs.slice(0, 2).join(' | '));
  } catch (e) { console.log(nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}

const W = +(process.env.W || 1280), H = +(process.env.H || 800);
if (quoi === 'planche' || quoi === 'tout') {
  for (const pose of ['face', 'dos']) for (const r of REGLAGES) {
    const nom = 'v-' + pose + '-' + r.nom;
    if (noms.length && !noms.includes(nom)) continue;
    await rendre(nom, { ...base, ...POSES[pose], scene: avec(r.h, r.brume), w: 640, h: 400 }, 640, 400);
  }
  // planche : vignettes étiquetées, composées dans une page
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  const cases = [];
  for (const pose of ['face', 'dos']) for (const r of REGLAGES) {
    const f = join(root, dir, 'v-' + pose + '-' + r.nom + '.png');
    cases.push({ src: existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : '', txt: r.etiquette, pose: pose === 'face' ? 'trois quarts contre-jour, le long du sentier' : 'dos au soleil' });
  }
  const url = await p.evaluate(async cases => {
    const load = s => new Promise(ok => { if (!s) return ok(null); const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const w = 640, h = 400, m = 12, tete = 54, bas = 34, c = document.createElement('canvas');
    c.width = 4 * w + 5 * m; c.height = tete + 2 * (h + bas + 26) + m; const g = c.getContext('2d');
    g.fillStyle = '#151515'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#eee'; g.font = '600 24px sans-serif';
    g.fillText('Grands Avaux, Champcueil, début novembre · lever du soleil vers 7 h 40 · moteur v3, qualité complète', m, 34);
    for (let i = 0; i < cases.length; i++) {
      const col = i % 4, row = Math.floor(i / 4), x = m + col * (w + m), y = tete + row * (h + bas + 26);
      if (col === 0) { g.fillStyle = '#aaa'; g.font = '18px sans-serif'; g.fillText(cases[i].pose, x, y + 18); }
      const im = await load(cases[i].src);
      if (im) g.drawImage(im, x, y + 26, w, h); else { g.fillStyle = '#300'; g.fillRect(x, y + 26, w, h); }
      g.fillStyle = '#eee'; g.font = '20px sans-serif'; g.fillText(cases[i].txt, x, y + 26 + h + 24);
    }
    return c.toDataURL('image/png');
  }, cases);
  writeFileSync(join(root, dir, 'planche-heure.png'), Buffer.from(url.split(',')[1], 'base64'));
  await b.close();
  console.log('planche :', join(dir, 'planche-heure.png'));
}
if (quoi === 'vues' || quoi === 'tout') {
  const V = {
    'plein-face': [{ ...base, ...POSES.face, scene: fiche, w: W, h: H }, 1280, 800],
    'plein-dos': [{ ...base, ...POSES.dos, scene: fiche, w: W, h: H }, 1280, 800],
    'plein-tronc': [{ ...base, ...POSES.tronc, scene: fiche, w: W, h: H }, 1280, 800],
    'telephone': [{ ...base, ...POSES.face, scene: fiche, full: false, mobile: true }, 390, 780],
  };
  for (const [nom, [cfg, vw, vh]] of Object.entries(V)) if (!noms.length || noms.includes(nom)) await rendre(nom, cfg, vw, vh);
}
